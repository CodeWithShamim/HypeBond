"""Test harness that loads hypebond.py against the genlayer stub.

`Chain` models a GenVM node: every call runs with an explicit sender and
value, and a reverting call rolls back the *entire* world (storage,
balances, events, transfers) the way a real node does. That rollback is
what makes checks-effects-interactions violations observable — a method
that transfers before writing its terminal state would show up here as a
transfer that survived a later revert.
"""

from __future__ import annotations

import copy
import importlib.util
import json
import sys
from pathlib import Path

STUBS = Path(__file__).parent / "stubs"
if str(STUBS) not in sys.path:
	sys.path.insert(0, str(STUBS))

import genlayer  # noqa: E402  (the stub, via sys.path above)
from genlayer import Address, host  # noqa: E402

CONTRACT_PATH = Path(__file__).resolve().parents[1] / "hypebond.py"


def load_contract_module():
	spec = importlib.util.spec_from_file_location("hypebond_contract", CONTRACT_PATH)
	assert spec and spec.loader
	module = importlib.util.module_from_spec(spec)
	spec.loader.exec_module(module)
	return module


hypebond = load_contract_module()

UserError = genlayer.UserError


def addr(byte: int) -> Address:
	"""Deterministic test address: 0xNN repeated 20 times."""
	return Address("0x" + f"{byte:02x}" * 20)


BRAND = addr(0xB1)
INFLUENCER = addr(0x11)
STRANGER = addr(0x5E)

TERMS = (
	"POST REQUIREMENTS:\n"
	"- Platform: X (Twitter)\n"
	"- Must mention: @hypebond and #ad\n"
	"- Must be an original post, not a reply or repost\n"
	"- Must stay live for at least 3 days"
)

POST_URL = "https://x.com/creator/status/1234567890"


class Revert(AssertionError):
	"""Raised by Chain.call when the contract reverts."""

	def __init__(self, message: str):
		super().__init__(message)
		self.message = message


class Chain:
	def __init__(self) -> None:
		self.host = host()
		self.host.reset()
		self.contract = hypebond.HypeBond()

	# -- world snapshotting ------------------------------------------------

	def _snapshot(self):
		h = self.host
		return (
			copy.deepcopy(self.contract.__dict__),
			h.contract_balance,
			dict(h.balances),
			list(h.events),
			list(h.transfers),
		)

	def _restore(self, snap) -> None:
		h = self.host
		self.contract.__dict__.clear()
		self.contract.__dict__.update(snap[0])
		h.contract_balance = snap[1]
		h.balances = dict(snap[2])
		h.events = list(snap[3])
		h.transfers = list(snap[4])

	# -- calls -------------------------------------------------------------

	def call(self, method: str, *args, sender: Address = BRAND, value: int = 0):
		"""Invoke a contract method. Reverts roll the world back."""
		snap = self._snapshot()
		self.host.message.sender_address = sender
		self.host.message.value = int(value)
		self.host.contract_balance += int(value)
		if value:
			self.host.balances[sender] = self.host.balances.get(sender, 0) - int(value)
		try:
			return getattr(self.contract, method)(*args)
		except UserError as exc:
			self._restore(snap)
			raise Revert(str(exc)) from None
		except genlayer.Rollback as exc:
			self._restore(snap)
			raise Revert(f"rollback: {exc}") from None
		finally:
			self.host.message.value = 0

	def view(self, method: str, *args):
		return getattr(self.contract, method)(*args)

	# -- convenience -------------------------------------------------------

	def create_deal(
		self,
		*,
		brand: Address = BRAND,
		influencer: Address = INFLUENCER,
		terms: str = TERMS,
		platform: str = "x",
		days: int = 3,
		escrow: int = 1_000,
	) -> int:
		return int(
			self.call(
				"create_deal",
				influencer.as_hex,
				terms,
				platform,
				days,
				sender=brand,
				value=escrow,
			)
		)

	def deal(self, deal_id: int) -> dict:
		return self.view("get_deal", deal_id)

	def status(self, deal_id: int) -> str:
		return self.deal(deal_id)["status"]

	def balance(self, who: Address) -> int:
		return self.host.balances.get(who, 0)

	def events_named(self, name: str) -> list:
		return [e for e in self.host.events if e.name == name]

	def warp(self, seconds: int) -> None:
		self.host.warp(seconds)

	def warp_days(self, days: float) -> None:
		self.host.warp(int(days * 86400))

	# -- programmable validators -------------------------------------------

	def program_page(self, text: str, url: str = POST_URL) -> None:
		self.host.web_pages[url] = text

	def program_fetch_failure(self, exc: Exception | None = None) -> None:
		self.host.web_error = exc or RuntimeError("fetch failed")

	def program_verdict(
		self,
		*,
		exists: bool = True,
		overall: bool = True,
		checks: list | None = None,
		reason: str = "The post satisfies every requirement.",
		raw: str | None = None,
	) -> None:
		"""Program what the leader's LLM returns for the judging prompt."""
		if raw is not None:
			self.host.llm_response = raw
			return
		if checks is None:
			checks = [
				{"requirement": "Mentions @hypebond", "passed": overall, "evidence": "@hypebond"},
			]
		self.host.llm_response = json.dumps(
			{
				"exists": exists,
				"checks": checks,
				"overall_pass": overall,
				"reason": reason,
			}
		)

	def program_consensus_failure(self, exc: Exception | None = None) -> None:
		self.host.consensus_error = exc or genlayer.NondeterminismError(
			"validators disagreed"
		)

	def clear_consensus_failure(self) -> None:
		self.host.consensus_error = None

	# -- flows -------------------------------------------------------------

	def cancel_deal(self, deal_id: int, *, brand: Address = BRAND) -> None:
		"""Run the brand's two-step cancellation to completion.

		The notice window is the anti-front-running control (see
		`cancel_deal`), so completing a cancellation always means: request,
		wait out CANCEL_NOTICE, confirm.
		"""
		self.call("cancel_deal", deal_id, sender=brand)
		self.warp(hypebond.CANCEL_NOTICE + 1)
		self.call("cancel_deal", deal_id, sender=brand)

	def submit_passing_post(self, deal_id: int, url: str = POST_URL) -> None:
		self.program_page("Loving the new drop from @hypebond #ad", url)
		self.program_verdict(exists=True, overall=True)
		self.call("submit_post", deal_id, url, sender=INFLUENCER)

	@property
	def last_prompt(self) -> str:
		return self.host.prompts[-1]

	@property
	def last_page_block(self) -> str:
		"""The untrusted region of the judging prompt.

		The prompt *names* the delimiters in its security preamble before
		using them, so the real region is the LAST pair — anchoring on the
		first occurrence would read the preamble instead.
		"""
		prompt = self.last_prompt
		after = prompt.rsplit("<<<PAGE>>>", 1)[1]
		return after.rsplit("<<<END PAGE>>>", 1)[0]

	@property
	def last_prompt_tail(self) -> str:
		"""Prompt text after the untrusted region — must stay uncontaminated."""
		return self.last_prompt.rsplit("<<<END PAGE>>>", 1)[1]
