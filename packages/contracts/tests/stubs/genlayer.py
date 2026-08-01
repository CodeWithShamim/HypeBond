"""Offline stub of the `genlayer` GenVM runtime, good enough to execute
packages/contracts/hypebond.py deterministically in plain CPython.

It mirrors the real semantics the contract depends on:

- storage objects are live references (mutating a Deal read out of a
  TreeMap persists), exactly like GenVM storage slots;
- u256/u8 are range-checked ints, so an overflow in the contract raises
  here instead of silently wrapping;
- `gl.vm.UserError` aborts the call, and the test harness rolls the whole
  world back so a revert cannot leave partial state (checks-effects
  violations therefore show up as test failures);
- non-determinism (`web.render`, `exec_prompt`, `eq_principle`) is
  programmable per test, including the "validators disagree" failure mode.

Only what hypebond.py touches is implemented — this is a test double, not
a GenVM reimplementation.
"""

from __future__ import annotations

import copy
import typing

__all__ = [
	"gl",
	"Address",
	"u8",
	"u32",
	"u64",
	"u256",
	"TreeMap",
	"DynArray",
	"allow_storage",
]


# ---------------------------------------------------------------- scalars


class _Uint(int):
	BITS = 256

	def __new__(cls, value: int = 0):
		v = int(value)
		if v < 0:
			raise OverflowError(f"{cls.__name__} cannot be negative: {v}")
		if v >= 1 << cls.BITS:
			raise OverflowError(f"{cls.__name__} overflow: {v}")
		return super().__new__(cls, v)

	def __repr__(self) -> str:
		return f"{type(self).__name__}({int(self)})"


class u8(_Uint):
	BITS = 8


class u32(_Uint):
	BITS = 32


class u64(_Uint):
	BITS = 64


class u256(_Uint):
	BITS = 256


class Address:
	"""20-byte account address. Accepts the 0x-hex form clients send."""

	__slots__ = ("_raw",)

	SIZE = 20

	def __init__(self, value: "str | bytes | Address"):
		if isinstance(value, Address):
			self._raw = value._raw
			return
		if isinstance(value, (bytes, bytearray)):
			raw = bytes(value)
		elif isinstance(value, str):
			s = value.strip()
			if not s.startswith("0x") and not s.startswith("0X"):
				raise ValueError(f"address must be 0x-prefixed: {value!r}")
			body = s[2:]
			if len(body) != self.SIZE * 2:
				raise ValueError(f"address must be {self.SIZE} bytes: {value!r}")
			try:
				raw = bytes.fromhex(body)
			except ValueError as exc:
				raise ValueError(f"address is not valid hex: {value!r}") from exc
		else:
			raise ValueError(f"unsupported address value: {value!r}")
		if len(raw) != self.SIZE:
			raise ValueError(f"address must be {self.SIZE} bytes: {value!r}")
		self._raw = raw

	@property
	def as_bytes(self) -> bytes:
		return self._raw

	@property
	def as_hex(self) -> str:
		return "0x" + self._raw.hex()

	def __eq__(self, other: object) -> bool:
		return isinstance(other, Address) and other._raw == self._raw

	def __hash__(self) -> int:
		return hash(self._raw)

	def __repr__(self) -> str:
		return f"Address({self.as_hex})"


# ---------------------------------------------------------------- storage


def allow_storage(cls):
	"""Marks a dataclass as storable. No-op here; storage is in-memory."""
	cls.__gl_storage__ = True
	return cls


class DynArray(list):
	"""Growable storage array."""


class TreeMap(dict):
	"""Ordered storage map with GenVM's get_or_insert_default helper."""

	def __init__(self, default_factory=DynArray):
		super().__init__()
		self._default_factory = default_factory

	def get_or_insert_default(self, key):
		if key not in self:
			self[key] = self._default_factory()
		return self[key]


# ---------------------------------------------------------------- vm errors


class UserError(Exception):
	"""Explicit contract revert (`raise gl.vm.UserError(...)`)."""


class Rollback(Exception):
	"""Non-UserError abort."""


class _Vm:
	UserError = UserError
	Rollback = Rollback


# ---------------------------------------------------------------- messages


class _Message:
	def __init__(self) -> None:
		self.sender_address: Address | None = None
		self.value: int = 0
		self.contract_address: Address | None = None


# ---------------------------------------------------------------- events


class Event:
	"""Base for `class Foo(gl.Event)`. Records emissions on the host.

	Event subclasses declare `def __init__(self, deal_id: u256, /): ...` with
	an empty body — the real runtime reads the signature and never runs it —
	so arguments are captured in __new__, which subclasses do not override.
	"""

	def __new__(cls, *args, **kwargs):
		obj = super().__new__(cls)
		obj._args = args
		obj._kwargs = kwargs
		return obj

	def emit(self) -> None:
		_HOST.events.append(
			EmittedEvent(type(self).__name__, tuple(self._args), dict(self._kwargs))
		)


class EmittedEvent(typing.NamedTuple):
	name: str
	args: tuple
	kwargs: dict

	def __repr__(self) -> str:
		return f"{self.name}{self.args}{self.kwargs or ''}"


# ---------------------------------------------------------------- contracts


def _do_transfer(to: Address, value) -> None:
	amount = int(value)
	if amount < 0:
		raise Rollback("negative transfer")
	if _HOST.contract_balance < amount:
		raise Rollback(
			f"insufficient contract balance: have {_HOST.contract_balance}, "
			f"sending {amount}"
		)
	_HOST.contract_balance -= amount
	_HOST.balances[to] = _HOST.balances.get(to, 0) + amount
	_HOST.transfers.append(Transfer(to, amount))


class _ContractHandle:
	"""What `gl.get_contract_at(addr)` returns — an INTERNAL message target.

	`emit_transfer` here emits a method-less contract call, which the chain
	routes to the recipient's `__receive__`. Against a wallet there is no
	contract to route to and the child transaction fails with "Contract 0x…
	not found" — while the parent call has already succeeded and the escrow
	has already left this contract. That silent, lossy failure is modelled
	here so a payout that goes back to the internal path fails a test instead
	of burning money on chain. `gl.evm.contract_interface` is the EOA path.
	"""

	def __init__(self, address: Address):
		self.address = address

	def emit_transfer(self, value) -> None:
		if self.address not in _HOST.deployed_contracts:
			raise Rollback(
				f"Contract {self.address.as_hex} not found — an internal "
				f"emit_transfer cannot pay an EOA; use gl.evm.contract_interface"
			)
		_do_transfer(self.address, value)


class _EvmProxy:
	"""What an `@gl.evm.contract_interface` class returns when constructed.

	Models an EXTERNAL message (`EthSend`): a plain value transfer that
	credits any address, whether or not a contract lives there.
	"""

	def __init__(self, address: Address):
		self.address = address if isinstance(address, Address) else Address(address)

	def emit_transfer(self, *, value=0) -> None:
		_do_transfer(self.address, value)


class _Evm:
	@staticmethod
	def contract_interface(cls):
		"""Decorator turning an interface declaration into a proxy factory."""
		return _EvmProxy


class Transfer(typing.NamedTuple):
	to: Address
	amount: int

	def __repr__(self) -> str:
		return f"Transfer({self.to.as_hex}, {self.amount})"


# ---------------------------------------------------------------- non-determinism


class NondeterminismError(Exception):
	"""Validators could not agree / the block could not be produced."""


class _Web:
	def render(self, url: str, mode: str = "text") -> str:
		return _HOST.web_render(url, mode)


class _Nondet:
	def __init__(self) -> None:
		self.web = _Web()

	def exec_prompt(self, prompt: str, **kwargs) -> str:
		return _HOST.exec_prompt(prompt, **kwargs)


class _EqPrinciple:
	def prompt_comparative(self, fn, principle: str, **kwargs):
		return _HOST.eq_principle_comparative(fn, principle)

	def strict_eq(self, fn):
		return fn()


# ---------------------------------------------------------------- decorators


def _identity(fn):
	return fn


class _Write:
	def __call__(self, fn):
		fn.__gl_kind__ = "write"
		return fn

	def payable(self, fn):
		fn.__gl_kind__ = "write.payable"
		fn.__gl_payable__ = True
		return fn


class _Public:
	def __init__(self) -> None:
		self.write = _Write()

	def view(self, fn):
		fn.__gl_kind__ = "view"
		return fn


class _Contract:
	"""Base class for `class HypeBond(gl.Contract)`.

	Class-level annotations declare storage; instances get zero values for
	them, matching a freshly deployed contract.
	"""

	def __init_subclass__(cls, **kwargs):
		super().__init_subclass__(**kwargs)
		_HOST.contract_class = cls

	def __new__(cls, *args, **kwargs):
		obj = super().__new__(cls)
		for name, ann in _collect_annotations(cls).items():
			setattr(obj, name, _zero_value(ann))
		return obj


def _collect_annotations(cls) -> dict:
	out: dict = {}
	for klass in reversed(cls.__mro__):
		out.update(getattr(klass, "__annotations__", {}))
	return out


def _zero_value(ann):
	origin = typing.get_origin(ann)
	if origin in (TreeMap, dict):
		args = typing.get_args(ann)
		value_ann = args[1] if len(args) > 1 else None
		if typing.get_origin(value_ann) is DynArray:
			return TreeMap(DynArray)
		return TreeMap(lambda: _zero_value(value_ann))
	if origin in (DynArray, list):
		return DynArray()
	if ann in (u8, u32, u64, u256):
		return ann(0)
	if ann is bool:
		return False
	if ann is str:
		return ""
	if ann is int:
		return 0
	return None


# ---------------------------------------------------------------- gl facade


class _Gl:
	Contract = _Contract
	Event = Event
	vm = _Vm()
	evm = _Evm()

	def __init__(self) -> None:
		self.public = _Public()
		self.nondet = _Nondet()
		self.eq_principle = _EqPrinciple()

	# -- runtime context, driven by the test host ------------------------

	@property
	def message(self) -> _Message:
		return _HOST.message

	@property
	def message_raw(self) -> dict:
		return _HOST.message_raw()

	def get_contract_at(self, address) -> _ContractHandle:
		return _ContractHandle(address if isinstance(address, Address) else Address(address))

	def advanced_view(self, fn):
		return fn

	def contract_interface(self, cls):
		return cls


# ---------------------------------------------------------------- test host


class Host:
	"""Mutable world the stub reads from; tests drive this directly."""

	def __init__(self) -> None:
		self.reset()

	def reset(self) -> None:
		self.now: int = 1_700_000_000  # 2023-11-14T22:13:20Z
		self.message = _Message()
		self.contract_class = getattr(self, "contract_class", None)
		self.contract_balance: int = 0
		self.balances: dict[Address, int] = {}
		# Addresses that actually host a contract. Everything else is a wallet,
		# so an internal `get_contract_at(...).emit_transfer` to it fails the
		# way the chain fails it. Tests may add entries to model contract-to-
		# contract payments.
		self.deployed_contracts: set[Address] = set()
		self.events: list[EmittedEvent] = []
		self.transfers: list[Transfer] = []
		self.prompts: list[str] = []
		self.rendered_urls: list[str] = []
		# Programmable non-determinism.
		self.web_pages: dict[str, str] = {}
		self.web_error: Exception | None = None
		self.llm_response: typing.Any = None
		self.llm_error: Exception | None = None
		self.consensus_error: Exception | None = None

	# -- clock ------------------------------------------------------------

	def message_raw(self) -> dict:
		import datetime as _dt

		# GenVM hands the contract an ISO-8601 UTC timestamp.
		iso = _dt.datetime.fromtimestamp(self.now, _dt.timezone.utc).isoformat()
		return {"datetime": iso.replace("+00:00", "Z")}

	def warp(self, seconds: int) -> None:
		self.now += int(seconds)

	# -- non-determinism --------------------------------------------------

	def web_render(self, url: str, mode: str) -> str:
		self.rendered_urls.append(url)
		if self.web_error is not None:
			raise self.web_error
		if url not in self.web_pages:
			raise RuntimeError(f"web.render: no page programmed for {url}")
		return self.web_pages[url]

	def exec_prompt(self, prompt: str, **kwargs) -> str:
		self.prompts.append(prompt)
		if self.llm_error is not None:
			raise self.llm_error
		resp = self.llm_response
		if callable(resp):
			return resp(prompt)
		if resp is None:
			raise RuntimeError("exec_prompt: no llm_response programmed")
		return resp

	def eq_principle_comparative(self, fn, principle: str):
		if self.consensus_error is not None:
			raise self.consensus_error
		return fn()


_HOST = Host()
gl = _Gl()


def host() -> Host:
	return _HOST
