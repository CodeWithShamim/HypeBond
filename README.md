# HypeBond — hype, bonded.

Influencer ad-deals locked in on-chain escrow and verified by **GenLayer AI
validators that fetch the actual live post**. Brands and creators agree to
plain-English terms, payment sits in the contract, and consensus over the
real page content — not screenshots — releases or refunds the bag.

```
brand locks escrow ─→ creator posts ─→ instant AI content check
        │                                   │
        │                     fail → 48h grace period to fix/repost
        │                     pass → live window (1–30 days)
        │                                   │
        └──── refund on cancel/timeout      └→ finalize: validators re-fetch
                                               the post → PAID or refunded
```

## Stack

- **Contract** — `packages/contracts/hypebond.py`, a GenLayer Intelligent
  Contract (Python/GenVM). Web fetch via `gl.nondet.web.render`, consensus
  via `gl.eq_principle.prompt_comparative` over verdict booleans only,
  injection-hardened judging prompt, fail-closed verification.
- **Frontend** — `apps/web`: Vite + React 18 + TypeScript, react-router v6,
  Tailwind, Framer Motion (boot loader, route wipes, bond-seal slam +
  confetti, odometers), TanStack Query with polling while validators run.
- **Chain client** — `genlayer-js` with three ways in: **Privy** (email /
  Google / X login with an embedded wallet, for creators who don't run an
  extension), **MetaMask** (auto-adds the GenLayer network), or a free guest
  wallet on studionet.
- **Shared** — `packages/shared`: TS types mirroring contract state, the
  terms builder, and platform URL rules (client mirror of contract checks).

## Run it

```sh
pnpm install

# 1. deploy the contract (GenLayer Studio running locally, or use the Studio UI)
pnpm deploy:contract                 # or: pnpm deploy:contract testnet-asimov

# 2. configure the app
cp .env.example .env                 # paste VITE_HYPEBOND_ADDRESS from step 1

# 3. go
pnpm dev
```

Other commands: `pnpm build` (typecheck + production build),
`pnpm lint:genvm` (contract lint/validation via genvm-linter).

### Privy login (optional)

Email / social sign-in with an embedded wallet needs an app id from
[dashboard.privy.io](https://dashboard.privy.io) in `VITE_PRIVY_APP_ID`.
Enable Email, Google and X as login methods there, and add the GenLayer
chain id (`61999` studionet / `4221` asimov) to the app's networks. Leave
the variable blank and the option is simply not offered — MetaMask and the
guest wallet still work. The SDK is loaded on demand, so visitors who never
connect don't download it.

## Tests

```sh
pnpm verify          # typecheck + every test + production build
pnpm test            # contract + frontend suites
pnpm test:contract   # contract only  (python3, stdlib — no install needed)
pnpm test:web        # frontend only  (vitest)
pnpm test:watch      # vitest in watch mode
pnpm lint:genvm      # contract lint + validation via genvm-linter
pnpm test:smoke      # against a DEPLOYED contract
node packages/contracts/scripts/verify-fixes.mjs   # security fixes, on-chain
```

### Last full run

All eight gates green on **2026-08-01** against
`0xd557dCf363cE191d7A5768fC656d9e4E03d8cA85` (studionet):

| Gate | Result |
| --- | --- |
| `pnpm lint:genvm` | passed — 10 methods, 4 view / 6 write |
| `pnpm test:contract` | 124 passed |
| `pnpm typecheck` | clean |
| `pnpm test:web` | 157 passed, 13 files |
| `pnpm build` | clean |
| `pnpm verify` | exit 0 |
| `pnpm test:smoke` (deployed) | 26 passed, 0 failed |
| `verify-fixes.mjs` (deployed) | 15 passed, 0 failed |

The last two run against the **deployed** contract rather than the stub. That
distinction matters: the stub is a test double, so passing there does not prove
the real GenVM accepts the same inputs. `verify-fixes.mjs` exercises the
security fixes specifically — delimiter-run forgeries, invisible/bidi
characters, and that honest terms are still accepted.

This table is a snapshot, not a live readout. The contract count is
drift-guarded by the Python suite, so it cannot silently go stale.

**Contract** (`packages/contracts/tests/`) — runs `hypebond.py` in plain
CPython against a stub of the GenVM runtime (`tests/stubs/genlayer.py`), so
no node, no deploy, no `genlayer` install. The stub models storage as live
references, range-checks `u256`/`u8`, and rolls the whole world back on a
revert, so a checks-effects-interactions violation shows up as a transfer
that survived a failed call. Web fetches, model output and consensus are
programmable per test — including the "validators disagreed" path.

Covers the lifecycle end to end plus the invariants above: escrow
accounting (every terminal path conserves value, no double payout), the
fail-closed paths, verdict aggregation, prompt-injection defenses, and the
URL host-confusion matrix. A drift guard fails the suite if the deal
fields, statuses or platform domains stop matching `packages/shared`.

**Frontend** (vitest + jsdom) — `packages/shared` logic (URL rules mirrored
against the contract, terms builder, chain-state parsing), escrow
formatting, GenVM receipt decoding (a missed revert would report a failed
transaction as confirmed), timeline derivation, and component rendering.

`pnpm test:smoke` additionally exercises a **deployed** contract on
studionet — it needs a running GenLayer Studio and a deployed address.

## Security model (contract)

- **Checks-effects-interactions everywhere**: terminal status + `settled`
  flag are written *before* any transfer; every money-moving path reverts
  if `settled` is already true — no double payouts.
- **Fail closed**: if validators can't agree on parseable verdict JSON the
  deal status doesn't change and an event fires; `recheck_post` /
  `finalize` can retry. A broken verification can never trigger a payout.
  A payout also requires a **non-empty check list** — `all([])` is `True`,
  so a verdict that verified nothing would otherwise release the escrow.
- **Prompt-injection defense**: fetched page content is wrapped in
  `<<<PAGE>>>` delimiters and declared untrusted; the judge is told to
  ignore any instructions inside it, and the terms cannot redefine the
  verdict format or grant automatic passes. Neutralization targets the
  **delimiter runs** (`<<<`, `>>>`, `---`) the markers are built from, not
  the literal markers — a model reads `<<<END  PAGE>>>` and
  `<<< end page >>>` as the same terminator, so matching literally leaves
  the attack open. Zero-width and bidi characters are stripped first so a
  run cannot be hidden from the scanner while the model still sees it.
- **Neither party can take the other's work.** The influencer must publish
  publicly *before* they can submit the URL, so `cancel_deal` runs on a 24h
  public notice and a submission during it voids the cancellation — the
  brand cannot watch the post go up and pull the escrow. Symmetrically, a
  page that cannot be **fetched** is not accepted as a deleted post until it
  has read unreachable for an hour, so a platform rate-limit cannot refund
  the brand out from under a post that is genuinely live.
- **Metered AI spend**: `recheck_post` and `finalize` are both
  anyone-callable and both cost a live fetch plus an LLM consensus round,
  so they share one cooldown.
- **No unbounded loops** in public methods — per-user index arrays with
  paged views. All timestamps from block context.
- URL platform checks run **client-side and contract-side**.

## Acceptance checklist

- [x] Brand can create + fund a deal; escrow amount visible on-chain (`amount` in `get_deal`).
- [x] Influencer submits URL; wrong-platform URL rejected client-side (`isValidPostUrl`) and contract-side (`_check_post_url`).
- [x] Initial check failure → GRACE_PERIOD with the AI's reason shown loud; resubmission works within 48h.
- [x] Finalize pays creator on pass / refunds brand on fail; second settlement attempts revert via `settled`.
- [x] Cancel only pre-submission, and only after a 24h public notice the creator can override by submitting; timeout claims only after the 14-day / 48-hour windows.
- [x] A post that cannot be fetched is retried, not settled — only a *confirmed* disappearance refunds the brand.
- [x] Verification prompt delimits untrusted content with injection-resistance instructions; JSON parse failure never pays out (fail closed).
- [x] Boot loader tied to real readiness (fonts + paint), split-panel exit; route transitions < 650ms; seal slam + confetti on PASS.
- [x] `useReducedMotion` disables marquees/confetti/transitions everywhere; app fully usable without motion.
- [x] Responsive: left rail → bottom tab bar; buttons have loading/disabled states; wallet, network and revert errors surfaced with specific copy.

## Monorepo layout

```
apps/web                  Vite SPA (pages, motion system, chain layer)
packages/contracts        hypebond.py + deploy script
packages/shared           contract-mirroring types, terms builder, parsers
```
