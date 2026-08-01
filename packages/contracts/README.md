# @hypebond/contracts

`hypebond.py` — the HypeBond Intelligent Contract (GenVM, Python).

## Lifecycle

```
create_deal (payable, brand)     -> FUNDED
submit_post (influencer)         -> initial AI check runs immediately:
                                    pass  -> VERIFYING   (waiting out the live window)
                                    fail  -> GRACE_PERIOD (48h to fix/repost)
                                    error -> SUBMITTED   (recheck_post retries; fail closed)
finalize (anyone, after window)  -> pass  -> PAID          escrow -> influencer
                                    fail  -> VERIFIED_FAIL escrow -> brand
cancel_deal (brand, FUNDED only) -> 24h notice, then CANCELLED  escrow -> brand
   (two calls: the first opens a public notice, the second completes it.
    submit_post stays open during the notice and voids the cancellation —
    the influencer must publish before they can submit, so an instant
    cancel would let the brand take a live post for free.
    The matured notice EXPIRES 24h later: past that the next call re-opens
    a fresh notice instead of settling, so a brand can never hold a silent
    standing option to cancel the moment a post appears.)
decline_deal (influencer, FUNDED)-> DECLINED               escrow -> brand
   (anyone can address a deal to any wallet, so the named influencer needs
    an exit that is not "do the work" or "wait 14 days". No notice window:
    they are refusing before doing any work, so there is nothing to take.)
claim_timeout (anyone)           -> REFUNDED               escrow -> brand
   (FUNDED + 14 days no post; GRACE_PERIOD + 48h no resubmission; or a
    check stuck for STALE_WINDOW — from first_submitted_at for SUBMITTED,
    from verify_after for VERIFYING. Open to anyone because the payee is
    always the brand, so there is nothing to steal by calling it.)
prune_deals (anyone, own indexes)-> removes SETTLED entries in bounded batches
```

**A timeout never substitutes for a verdict nobody asked for.** The VERIFYING
branch of `claim_timeout` additionally requires that a `finalize` was
*attempted* after the live window and failed to settle (`last_check_at >=
verify_after`). `SUBMITTED` is itself evidence a check errored; `VERIFYING` is
not — it means the initial check *passed*. Without the extra condition a brand
could stay silent for 14 days and reclaim the escrow from a post that was live
and passing the whole time.

Verification fetches the live post with `gl.nondet.web.render(url, mode="text")`,
judges it against the on-chain terms with an injection-hardened prompt
(page content delimited as untrusted), and reaches consensus via
`gl.eq_principle.prompt_comparative` comparing only the verdict booleans.
Unparseable output **fails closed**: status unchanged, no funds move. A payout
additionally requires a non-empty check list, so a verdict that verified
nothing can never release the escrow.

A page that cannot be **fetched at all** is treated separately from a page the
judge read and found deleted. Platforms rate-limit and validators share egress
addresses, so an unreachable reading is not acted on immediately at **either**
check: the condition must persist for `UNREACHABLE_CONFIRM` (1h) before final
verification accepts the post as gone and refunds the brand, and before the
initial check drops the deal into `GRACE_PERIOD`. The initial check needs the
same protection because `grace_until` is set once and never extended — a
transient outage would otherwise silently spend the influencer's entire 48h fix
window on a post that was live the whole time. A page that loads and shows a
deletion notice still settles at once.

## Lint / validate locally

```sh
pnpm lint:genvm
# = uvx --from genvm-linter genvm-lint check packages/contracts/hypebond.py
```

## Deploy

Option A — script (studionet needs GenLayer Studio running locally, default
`https://studio.genlayer.com` proxy chain in genlayer-js):

```sh
pnpm deploy:contract                 # studionet
pnpm deploy:contract testnet-asimov  # needs funded DEPLOYER_PRIVATE_KEY in .env
```

Option B — GenLayer Studio UI: paste `hypebond.py` into
[studio.genlayer.com](https://studio.genlayer.com), deploy with no
constructor args, and copy the contract address.

Then put the address in the repo-root `.env`:

```
VITE_HYPEBOND_ADDRESS=0x…
VITE_GENLAYER_NETWORK=studionet   # or testnet-asimov
```
