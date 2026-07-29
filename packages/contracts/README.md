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
cancel_deal (brand, FUNDED only) -> CANCELLED              escrow -> brand
claim_timeout (brand)            -> REFUNDED               escrow -> brand
   (FUNDED + 14 days no post, or GRACE_PERIOD + 48h no resubmission)
```

Verification fetches the live post with `gl.nondet.web.render(url, mode="text")`,
judges it against the on-chain terms with an injection-hardened prompt
(page content delimited as untrusted), and reaches consensus via
`gl.eq_principle.prompt_comparative` comparing only the verdict booleans.
Unparseable output **fails closed**: status unchanged, no funds move.

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
