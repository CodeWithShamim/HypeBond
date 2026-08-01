# Milestone — hardening the escrow against both parties

> **Draft for submission notes.** Facts, commands and results here are real and
> reproducible. Put the framing in your own words before submitting — the
> review guidance explicitly penalises generic AI-written intros.

## What HypeBond is (one paragraph)

A brand and an influencer agree a sponsorship in plain English. The brand locks
the payment in a GenLayer Intelligent Contract along with the terms. The
influencer posts, submits the URL, and GenLayer validators independently fetch
the **actual live page** and judge it against those terms, reaching consensus on
per-criterion booleans. Pass releases the escrow to the influencer; fail refunds
the brand. No agency in the middle, no screenshots, no ghosting.

The trust problem is not "write me a better caption" — it is _did this person
actually post what they promised, and is it still up?_ That answer lives on the
open web, changes over time, and both parties have money riding on it. That is
what validator consensus over live web data is for.

## Why this is a milestone, not a repackage

The accepted version had four ways the escrow could move to the wrong party.
This milestone closes all four. Every one is demonstrated by a test that
**fails when the fix is reverted** — that's the bar I held, not "the suite is
green".

### 1. A verdict that verified nothing released the whole escrow

`all([])` is `True` in Python. A verdict of
`{"exists": true, "checks": [], "overall_pass": true}` therefore passed the
aggregation and paid out having checked **zero** criteria — and it is precisely
the JSON an injected page instructs the model to emit. The equivalence
principle could not catch it either: two empty check lists agree trivially, so
both validators "confirm" the payout.

A payout now requires a non-empty check list, in both the leader aggregation
and the post-consensus one that actually gates the transfer.

### 2. Delimiter forgery was defeated by pressing the spacebar

Page neutralisation matched the four prompt markers byte-exactly, so
`<<<END  PAGE>>>` (two spaces) or `<<< end page >>>` passed straight through —
and a language model reads those as the same region terminator. The same hole
existed in the terms check.

Neutralisation now targets the **delimiter runs** (`<<<`, `>>>`, `---`) that
every marker is built from, which kills all spacing and casing variants at
once. Zero-width and bidi characters are stripped first, so a run cannot be
split past the scanner while the model still sees the marker. Ordinary prose
(`co-founder`, `3 < 5`) survives — there is a test pinning that, because
over-redaction would blind the judge to the content it must judge.

### 3. The brand could take a published post for free

The influencer must publish **publicly** before `submit_post` is callable.
`cancel_deal` settled instantly, so the brand could watch the post appear in
their own feed — no mempool access, no front-running sophistication — and
reclaim the escrow in the gap. The influencer cannot un-publish.

`cancel_deal` now runs on a 24-hour public notice: the first call opens it, the
second completes it, and `submit_post` stays open throughout. A submission
moves the deal out of `FUNDED` and voids the cancellation permanently. A brand
can still walk away from a deal nobody engaged with — just not in the seconds
after the post goes up.

### 4. One failed fetch permanently killed a live deal

A `web.render` exception produced a deterministic `exists:false` verdict that
settled straight to `VERIFIED_FAIL`. The asymmetry gave it away: an unparseable
_LLM verdict_ failed closed and stayed retryable, but an unreachable _page_ was
terminal — and platforms rate-limit datacenter IPs constantly.

The deterministic verdict now carries `fetch_failed`, threaded through consensus
(the equivalence principle compares it), which distinguishes _"we could not
look"_ from _"we looked and the post is gone"_. An unreachable reading must
persist for an hour before it settles. A page that loads and shows a deletion
notice still settles immediately — the product requirement is intact, with a
test pinning it.

## Also in this milestone

- **Dashboard showed a user's oldest 50 bonds.** The per-user index is
  append-ordered and the contract pages at 50, so past 50 deals the newest were
  invisible. Both lists now walk every page.
- **Deal-creation could hand back a pre-existing deal id** when the read node
  lagged the confirmed write — a plausible-looking id that sent the brand to an
  older bond and let them share that link as the new one. Now snapshots before
  the write and only accepts an id that advanced.
- **Both anyone-callable AI paths are metered.** `finalize` had no cooldown
  though `recheck_post` did, despite both spending a live fetch plus an LLM
  consensus round.
- **Anti-spam escrow floor** (`MIN_ESCROW`, 0.01 GEN). `create_deal` appends to
  the _influencer's_ index and anyone can name anyone, so dust deals could bury
  a stranger's dashboard.
- Stale verdicts no longer survive a resubmission; view methods revert cleanly
  on a malformed address.

## Reproducing it

```sh
pnpm verify            # typecheck + every test + production build
pnpm lint:genvm        # GenVM linter / validator
pnpm test:smoke        # against the deployed contract
node packages/contracts/scripts/verify-fixes.mjs   # security fixes, on-chain
```

Current results:

| Gate                                | Result                                |
| ----------------------------------- | ------------------------------------- |
| Contract suite (offline GenVM stub) | 123 passed                            |
| Frontend suite (vitest + jsdom)     | 157 passed                            |
| GenVM lint / validate               | passed — 10 methods, 4 view / 6 write |
| Smoke test vs deployed contract     | 26 passed, 0 failed                   |
| Security-fix verification, on-chain | 15 passed, 0 failed                   |
| Production build                    | clean                                 |

Deployed (studionet): `0xf13FDD9E5C3e72eC92a611cCd1779cde39f06D2f`
(`0x8D656B0D…` retired 2026-08-01 — its payouts used an internal message,
which cannot pay a wallet, so every settlement burned its escrow.)

The contract suite runs `hypebond.py` in plain CPython against a stub of the
GenVM runtime, so it needs no node and no deploy. The stub models storage as
live references and rolls the world back on a revert, which is what makes a
checks-effects-interactions violation observable as a transfer that survived a
failed call. Web fetches, model output and consensus are programmable per
test — including the "validators disagreed" path.

`verify-fixes.mjs` exists because the offline stub is a test double: passing
there does not prove the real GenVM accepts the same inputs. It exercises the
fixes against a live deployment.

## Known limits — deliberately not claimed as done

Stating these because a reviewer will find them anyway, and because they are
the honest roadmap.

- **The escrow floor raises the bar on index spam; it does not close it.** The
  escrow is refundable, so it is a capital requirement rather than a fee — a
  spammer can recycle it every 24h. The structural fix is a bounded or opt-in
  per-user index, which is a storage-layout change and therefore its own
  milestone.
- **Two fixes are verified offline only, by nature.** The empty-checks
  fail-open needs a controlled LLM verdict and the finalize cooldown needs a
  lapsed live window (minimum one day), so neither fits an on-chain smoke test.
- **The judge is still a language model.** The contract constrains what can
  reach it and never trusts its `overall_pass` on its own, but the hardening is
  defence in depth, not a proof.
- **Studionet only.** No testnet-asimov deployment yet.

## Path forward

- Bounded / opt-in influencer index — closes the spam vector properly.
- Deploy to testnet-asimov and run the same gates against it.
- Partial settlement for partially-met terms, instead of the current
  all-or-nothing verdict.
- Let the influencer accept terms on-chain before the brand's escrow locks, so
  the agreement is bilateral rather than assigned.
