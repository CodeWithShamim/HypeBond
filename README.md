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
- **Chain client** — `genlayer-js` with MetaMask (auto-adds the GenLayer
  network) or a free guest wallet on studionet.
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

## Security model (contract)

- **Checks-effects-interactions everywhere**: terminal status + `settled`
  flag are written *before* any transfer; every money-moving path reverts
  if `settled` is already true — no double payouts.
- **Fail closed**: if validators can't agree on parseable verdict JSON the
  deal status doesn't change and an event fires; `recheck_post` /
  `finalize` can retry. A broken verification can never trigger a payout.
- **Prompt-injection defense**: fetched page content is wrapped in
  `<<<PAGE>>>` delimiters and declared untrusted; the judge is told to
  ignore any instructions inside it, and the terms cannot redefine the
  verdict format or grant automatic passes.
- **No unbounded loops** in public methods — per-user index arrays with
  paged views. All timestamps from block context.
- URL platform checks run **client-side and contract-side**.

## Acceptance checklist

- [x] Brand can create + fund a deal; escrow amount visible on-chain (`amount` in `get_deal`).
- [x] Influencer submits URL; wrong-platform URL rejected client-side (`isValidPostUrl`) and contract-side (`_check_post_url`).
- [x] Initial check failure → GRACE_PERIOD with the AI's reason shown loud; resubmission works within 48h.
- [x] Finalize pays creator on pass / refunds brand on fail; second settlement attempts revert via `settled`.
- [x] Cancel only pre-submission; timeout claims only after the 14-day / 48-hour windows.
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
