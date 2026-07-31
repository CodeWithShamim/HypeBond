import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  checkCooldownUntil,
  dealSerial,
  isValidPostUrl,
  PLATFORM_LABELS,
  staleDeadline,
  submitDeadline,
  type Deal,
} from "@hypebond/shared";
import {
  useCancelDeal,
  useClaimTimeout,
  useDeal,
  useFinalize,
  useRecheckPost,
  useSubmitPost,
} from "@/hooks/useHypebond";
import { useWallet } from "@/lib/wallet";
import {
  countdownLabel,
  countdownTo,
  errorMessage,
  formatDate,
  formatGen,
  shortAddr,
} from "@/lib/format";
import { CONTRACT_CONFIGURED } from "@/lib/genlayer";
import { PageItem } from "@/components/motion/PageTransition";
import { BondingLoader } from "@/components/motion/BondingLoader";
import { Odometer } from "@/components/motion/Odometer";
import { Seal } from "@/components/motion/Seal";
import { Timeline } from "@/components/Timeline";
import { ChecksList } from "@/components/ChecksList";
import { ExplorerLink } from "@/components/ExplorerLink";
import { PlatformIcon } from "@/components/PlatformTile";
import {
  Button,
  EmptyState,
  ErrorStrip,
  Field,
  MonoBlock,
  StatusChip,
  StickerCard,
  TextInput,
} from "@/components/ui";

function useNow(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** Influencer's submit/resubmit form (FUNDED or GRACE_PERIOD). */
function SubmitPostForm({ deal }: { deal: Deal }) {
  const [url, setUrl] = useState("");
  const [touched, setTouched] = useState(false);
  const submit = useSubmitPost();
  const valid = isValidPostUrl(url.trim(), deal.platform);
  const showError = touched && url.trim().length > 0 && !valid;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) submit.mutate({ dealId: deal.id, postUrl: url.trim() });
      }}
      className="space-y-4"
    >
      <Field
        label={`Post URL on ${PLATFORM_LABELS[deal.platform]}`}
        hint={`https:// link on ${PLATFORM_LABELS[deal.platform]} — validators fetch this exact page`}
        error={
          showError
            ? `That doesn't look like a ${PLATFORM_LABELS[deal.platform]} URL.`
            : undefined
        }
      >
        <TextInput
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="https://…"
          spellCheck={false}
          autoComplete="off"
        />
      </Field>
      {submit.isPending ? (
        <BondingLoader
          lines={[
            "submitting the post…",
            "validators reading the post…",
            "running the content check…",
          ]}
        />
      ) : (
        <Button type="submit" disabled={!valid}>
          {deal.status === "GRACE_PERIOD" ? "Resubmit post" : "Submit post URL"}
        </Button>
      )}
    </form>
  );
}

export function DealPage() {
  const { id } = useParams();
  const dealId = Number(id);
  const validId = Number.isInteger(dealId) && dealId > 0;
  const { data: deal, isLoading, error } = useDeal(validId ? dealId : null);
  const wallet = useWallet();
  const now = useNow();

  const finalize = useFinalize();
  const cancel = useCancelDeal();
  const timeout = useClaimTimeout();
  const recheck = useRecheckPost();

  const me = wallet.address?.toLowerCase() ?? null;
  const isBrand = !!deal && me === deal.brand.toLowerCase();
  const isInfluencer = !!deal && me === deal.influencer.toLowerCase();

  const liveCountdown = useMemo(
    () => (deal ? countdownTo(deal.verify_after, now) : null),
    [deal, now]
  );
  const graceCountdown = useMemo(
    () => (deal ? countdownTo(deal.grace_until, now) : null),
    [deal, now]
  );
  const submitTimeoutReady =
    !!deal && deal.status === "FUNDED" && now / 1000 >= submitDeadline(deal);
  const graceTimeoutReady =
    !!deal && deal.status === "GRACE_PERIOD" && now / 1000 >= deal.grace_until;
  // Verification never resolved — the brand's last-resort reclaim.
  const staleAt = deal ? staleDeadline(deal) : null;
  const staleTimeoutReady = staleAt !== null && now / 1000 >= staleAt;
  // Both AI retry paths share one on-chain cooldown. Offering a button the
  // contract will reject just burns the caller's gas on a certain revert.
  const cooldownUntil = deal ? checkCooldownUntil(deal) : 0;
  const cooldown = useMemo(
    () => countdownTo(cooldownUntil, now),
    [cooldownUntil, now]
  );
  const checkCoolingDown = cooldownUntil > 0 && !cooldown.done;

  if (!CONTRACT_CONFIGURED) {
    return (
      <EmptyState
        title="No contract configured"
        body="Deploy hypebond.py and set VITE_HYPEBOND_ADDRESS in the repo-root .env."
      />
    );
  }
  if (!validId) {
    return <EmptyState title="Bad bond id" body="That URL doesn't point at a bond." />;
  }
  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <BondingLoader lines={["pulling the bond…", "reading the chain…"]} />
      </div>
    );
  }
  if (error) {
    return <ErrorStrip>Could not load the bond: {errorMessage(error)}</ErrorStrip>;
  }
  if (!deal) {
    return (
      <EmptyState
        title="Bond not found"
        body={`No bond with id ${dealId} exists on this contract.`}
      />
    );
  }

  const settledPass = deal.status === "PAID";
  const settledFail = deal.status === "VERIFIED_FAIL";

  return (
    <div className="space-y-6">
      {/* bond header */}
      <PageItem>
        <StickerCard className="relative overflow-hidden p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-bone/40">
                <PlatformIcon platform={deal.platform} size={16} />
                {PLATFORM_LABELS[deal.platform]} · {dealSerial(deal.id)}
              </p>
              <p className="mt-2 font-display text-5xl font-bold tracking-tight text-bone md:text-6xl">
                <Odometer value={formatGen(deal.amount)} />
                <span className="ml-2 text-xl text-bone/40">GEN</span>
              </p>
              <p className="mt-1 font-mono text-xs text-bone/40">
                escrowed on-chain · created {formatDate(deal.created_at)}
              </p>
            </div>
            <StatusChip status={deal.status} />
          </div>
          <div className="mt-6 grid gap-3 font-mono text-xs text-bone/60 sm:grid-cols-2">
            <p>
              <span className="text-bone/35">brand </span>
              {shortAddr(deal.brand)}
              {isBrand && <span className="ml-1.5 text-pulse">(you)</span>}
            </p>
            <p>
              <span className="text-bone/35">creator </span>
              {shortAddr(deal.influencer)}
              {isInfluencer && <span className="ml-1.5 text-pulse">(you)</span>}
            </p>
            {deal.post_url && (
              <p className="sm:col-span-2">
                <span className="text-bone/35">post </span>
                {/* Only linkify what still passes the platform URL rules —
                    never hand an arbitrary stored string to href. */}
                {isValidPostUrl(deal.post_url, deal.platform) ? (
                  <a
                    href={deal.post_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-pulse underline"
                  >
                    {deal.post_url}
                  </a>
                ) : (
                  <span className="break-all text-bone/60">
                    {deal.post_url}
                  </span>
                )}
              </p>
            )}
          </div>
          {(settledPass || settledFail) && (
            <div className="pointer-events-none absolute -right-6 -top-6 md:right-2 md:top-2">
              <Seal verdict={settledPass ? "pass" : "fail"} size={130} />
            </div>
          )}
        </StickerCard>
      </PageItem>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* timeline */}
        <PageItem className="lg:col-span-2">
          <StickerCard className="h-full p-6">
            <h2 className="mb-5 font-display text-lg font-bold uppercase tracking-tight text-bone">
              Bond timeline
            </h2>
            <Timeline deal={deal} />
          </StickerCard>
        </PageItem>

        <div className="space-y-6 lg:col-span-3">
          {/* action zone, role-aware */}
          <PageItem>
            <StickerCard className="p-6">
              <h2 className="mb-4 font-display text-lg font-bold uppercase tracking-tight text-bone">
                {settledPass
                  ? "Bag released"
                  : settledFail
                    ? "Bond broken"
                    : deal.status === "CANCELLED" || deal.status === "REFUNDED"
                      ? "Bond closed"
                      : "Next move"}
              </h2>

              {/* GRACE: loud fail reason + countdown */}
              {deal.status === "GRACE_PERIOD" && (
                <div className="mb-5 space-y-3">
                  <ErrorStrip>
                    <span className="font-bold uppercase">
                      Initial check failed:
                    </span>{" "}
                    {deal.verdict_reason || "the post did not meet the terms."}
                  </ErrorStrip>
                  {graceCountdown && !graceCountdown.done && (
                    <p className="font-mono text-sm text-heat">
                      fix window closes in{" "}
                      <Odometer
                        value={countdownLabel(graceCountdown)}
                        className="font-bold"
                      />
                    </p>
                  )}
                </div>
              )}

              {/* influencer: submit / resubmit */}
              {isInfluencer &&
                (deal.status === "FUNDED" ||
                  (deal.status === "GRACE_PERIOD" &&
                    graceCountdown &&
                    !graceCountdown.done)) && <SubmitPostForm deal={deal} />}

              {/* waiting on influencer, viewer is not the influencer */}
              {deal.status === "FUNDED" && !isInfluencer && (
                <p className="text-sm text-bone/50">
                  Waiting for the creator to post and submit the URL. Escrow is
                  locked until they deliver or the 14-day window lapses (
                  {formatDate(submitDeadline(deal))}).
                </p>
              )}

              {/* initial check pending / errored */}
              {deal.status === "SUBMITTED" && (
                <div className="space-y-4">
                  <BondingLoader
                    lines={[
                      "validators reading the post…",
                      "counting the hype…",
                      "checking mentions and links…",
                    ]}
                  />
                  <p className="font-mono text-xs text-bone/40">
                    If the check errored out, anyone can re-run it — it never
                    auto-passes.
                  </p>
                  <Button
                    variant="ghost"
                    loading={recheck.isPending}
                    disabled={!wallet.address || checkCoolingDown}
                    onClick={() => recheck.mutate({ dealId: deal.id })}
                  >
                    {checkCoolingDown
                      ? `Re-run in ${countdownLabel(cooldown)}`
                      : "Re-run check"}
                  </Button>
                </div>
              )}

              {/* live window + finalize */}
              {deal.status === "VERIFYING" && liveCountdown && (
                <div className="space-y-4">
                  {liveCountdown.done ? (
                    <p className="text-sm text-bone/60">
                      The live window is over. Anyone can finalize — validators
                      re-fetch the post and settle the escrow.
                    </p>
                  ) : (
                    <div>
                      <p className="font-mono text-xs uppercase tracking-widest text-bone/40">
                        live window ends in
                      </p>
                      <p className="mt-1 font-display text-4xl font-bold text-hype">
                        <Odometer value={countdownLabel(liveCountdown)} />
                      </p>
                    </div>
                  )}
                  {finalize.isPending ? (
                    <BondingLoader
                      lines={[
                        "validators reading the post…",
                        "final verification running…",
                        "settling the escrow…",
                      ]}
                    />
                  ) : (
                    <Button
                      disabled={
                        !liveCountdown.done || !wallet.address || checkCoolingDown
                      }
                      onClick={() => finalize.mutate({ dealId: deal.id })}
                    >
                      {liveCountdown.done && checkCoolingDown
                        ? `Retry in ${countdownLabel(cooldown)}`
                        : "Finalize bond"}
                    </Button>
                  )}
                  {liveCountdown.done && checkCoolingDown && (
                    <p className="font-mono text-xs text-bone/40">
                      A check just ran without reaching a verdict. Finalization
                      stays open to anyone for 14 days — it never auto-passes.
                    </p>
                  )}
                  {!wallet.address && (
                    <p className="font-mono text-xs text-bone/40">
                      connect a wallet to trigger finalization
                    </p>
                  )}
                </div>
              )}

              {/* brand: cancel + timeouts */}
              {isBrand && deal.status === "FUNDED" && (
                <div className="mt-5 flex flex-wrap gap-3 border-t-2 border-static pt-5">
                  <Button
                    variant="danger"
                    loading={cancel.isPending}
                    onClick={() => cancel.mutate({ dealId: deal.id })}
                  >
                    Cancel &amp; refund
                  </Button>
                  {submitTimeoutReady && (
                    <Button
                      variant="danger"
                      loading={timeout.isPending}
                      onClick={() => timeout.mutate({ dealId: deal.id })}
                    >
                      Claim 14-day timeout
                    </Button>
                  )}
                </div>
              )}
              {isBrand && graceTimeoutReady && (
                <div className="mt-5 border-t-2 border-static pt-5">
                  <Button
                    variant="danger"
                    loading={timeout.isPending}
                    onClick={() => timeout.mutate({ dealId: deal.id })}
                  >
                    Claim grace-period timeout
                  </Button>
                </div>
              )}

              {/* Verification stuck: retries stay open to anyone for 14 days,
                  after which the brand can reclaim rather than leaving the
                  escrow locked forever. */}
              {isBrand && staleTimeoutReady && (
                <div className="mt-5 space-y-3 border-t-2 border-static pt-5">
                  <p className="font-mono text-xs text-bone/40">
                    Verification never reached a verdict in 14 days. You can
                    reclaim the escrow.
                  </p>
                  <Button
                    variant="danger"
                    loading={timeout.isPending}
                    onClick={() => timeout.mutate({ dealId: deal.id })}
                  >
                    Reclaim stalled escrow
                  </Button>
                </div>
              )}

              {/* terminal states */}
              {settledPass && (
                <p className="text-sm text-bone/60">
                  Final verification passed —{" "}
                  <span className="font-bold text-volt">
                    {formatGen(deal.amount)} GEN
                  </span>{" "}
                  went to the creator. {deal.verdict_reason}
                </p>
              )}
              {settledFail && (
                <ErrorStrip>
                  Final verification failed — escrow refunded to the brand.{" "}
                  {deal.verdict_reason}
                </ErrorStrip>
              )}
              {deal.status === "CANCELLED" && (
                <p className="text-sm text-bone/50">
                  The brand cancelled before any post was submitted. Escrow
                  refunded in full.
                </p>
              )}
              {deal.status === "REFUNDED" && (
                <p className="text-sm text-bone/50">
                  {deal.verdict_reason ||
                    "Escrow was reclaimed by the brand after a timeout."}
                </p>
              )}
            </StickerCard>
          </PageItem>

          {/* verification checklist */}
          {deal.checks_passed && (
            <PageItem>
              <StickerCard className="p-6">
                <h2 className="mb-4 font-display text-lg font-bold uppercase tracking-tight text-bone">
                  Validator checklist
                </h2>
                <ChecksList checksJson={deal.checks_passed} />
              </StickerCard>
            </PageItem>
          )}

          {/* terms */}
          <PageItem>
            <StickerCard className="p-6">
              <h2 className="mb-4 font-display text-lg font-bold uppercase tracking-tight text-bone">
                Deal terms (on-chain)
              </h2>
              <MonoBlock>{deal.terms}</MonoBlock>
              {/* Anyone — brand, creator, or a stranger — can audit the
                  escrow: every action here is a public transaction. */}
              <div className="mt-5 border-t-2 border-static pt-5">
                <p className="mb-3 font-mono text-xs text-bone/40">
                  Funding, submission and settlement are public transactions on
                  the HypeBond contract — anyone can verify them.
                </p>
                <ExplorerLink className="sm:max-w-xs" />
              </div>
            </StickerCard>
          </PageItem>
        </div>
      </div>
    </div>
  );
}
