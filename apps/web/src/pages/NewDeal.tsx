import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  buildTerms,
  dealSerial,
  PLATFORMS,
  PLATFORM_LABELS,
  MIN_ESCROW_LABEL,
  MIN_ESCROW_WEI,
  TERMS_MAX,
  TERMS_MIN,
  termsProblem,
  type Platform,
} from "@hypebond/shared";
import { useCreateDeal } from "@/hooks/useHypebond";
import { useWallet } from "@/lib/wallet";
import { formatGen, parseGen, shortAddr } from "@/lib/format";
import { CONTRACT_CONFIGURED } from "@/lib/genlayer";
import { PageItem } from "@/components/motion/PageTransition";
import { BondingLoader } from "@/components/motion/BondingLoader";
import { Seal } from "@/components/motion/Seal";
import { PlatformTile } from "@/components/PlatformTile";
import {
  Button,
  EmptyState,
  ErrorStrip,
  Field,
  MonoBlock,
  StickerCard,
  TextArea,
  TextInput,
} from "@/components/ui";

const STEPS = ["Parties", "Escrow", "Terms", "Review"] as const;

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

// Starting values for the wizard — a workable draft the brand edits down,
// rather than four empty steps. The creator address stays blank: it's the one
// field with no sane default.
const DEFAULTS = {
  platform: "x" as Platform,
  amount: "500",
  minLiveDays: 7,
  mentions: "@BrandName",
  hashtags: "#BrandCampaign",
  link: "brandsite.com",
  tone: true,
  originalOnly: true,
  extra: "Must show the product on camera",
};

export function NewDeal() {
  const wallet = useWallet();
  const reduced = useReducedMotion();
  const create = useCreateDeal();

  const [step, setStep] = useState(0);
  const [createdId, setCreatedId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  // form state
  const [influencer, setInfluencer] = useState("");
  const [platform, setPlatform] = useState<Platform>(DEFAULTS.platform);
  const [amountStr, setAmountStr] = useState(DEFAULTS.amount);
  const [minLiveDays, setMinLiveDays] = useState(DEFAULTS.minLiveDays);
  const [mentions, setMentions] = useState(DEFAULTS.mentions);
  const [hashtags, setHashtags] = useState(DEFAULTS.hashtags);
  const [link, setLink] = useState(DEFAULTS.link);
  const [tone, setTone] = useState(DEFAULTS.tone);
  const [originalOnly, setOriginalOnly] = useState(DEFAULTS.originalOnly);
  const [extra, setExtra] = useState(DEFAULTS.extra);

  const terms = useMemo(
    () =>
      buildTerms({
        platform,
        mentions: mentions
          .split(/[,\s]+/)
          .map((m) => m.trim())
          .filter(Boolean)
          .map((m) => (m.startsWith("@") ? m : `@${m}`)),
        hashtags: hashtags
          .split(/[,\s]+/)
          .map((h) => h.trim())
          .filter(Boolean)
          .map((h) => (h.startsWith("#") ? h : `#${h}`)),
        link,
        tone,
        originalOnly,
        minLiveDays,
        extra,
      }),
    [platform, mentions, hashtags, link, tone, originalOnly, minLiveDays, extra]
  );

  const escrow = parseGen(amountStr);
  const me = wallet.address?.toLowerCase();
  const influencerOk =
    ADDR_RE.test(influencer.trim()) && influencer.trim().toLowerCase() !== me;
  // The contract enforces a floor (MIN_ESCROW) so dust deals cannot bury a
  // stranger's dashboard; catch it inline rather than on-chain.
  const escrowOk = escrow !== null && escrow >= MIN_ESCROW_WEI;
  // The contract rejects prompt-delimiter markers in terms, so catch it here
  // rather than letting the brand pay gas to learn that.
  const termsIssue = termsProblem(terms);
  const termsLengthOk = terms.length >= TERMS_MIN && terms.length <= TERMS_MAX;
  const termsOk = termsLengthOk && termsIssue === null;

  const stepOk = [influencerOk, escrowOk, termsOk, true][step];

  if (!CONTRACT_CONFIGURED) {
    return (
      <EmptyState
        title="No contract configured"
        body="Deploy hypebond.py and set VITE_HYPEBOND_ADDRESS in the repo-root .env."
      />
    );
  }

  if (!wallet.address) {
    return (
      <EmptyState
        title="Connect to start a bond"
        body="The brand wallet funds the escrow, so connect first — MetaMask, or a free guest wallet on studionet."
      />
    );
  }

  // ---------- success screen: shareable bond-seal card ----------
  if (createdId !== null) {
    // createdId 0 = tx confirmed but the fresh id couldn't be read back.
    const known = createdId > 0;
    const url = `${window.location.origin}/deal/${createdId}`;
    return (
      <div className="flex flex-col items-center gap-8 py-10">
        <StickerCard className="flex w-full max-w-md flex-col items-center gap-5 p-8 text-center">
          <Seal verdict="pass" size={150} />
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-bone/40">
              bond minted
            </p>
            <p className="mt-1 font-display text-4xl font-bold tracking-tight text-bone">
              {known ? dealSerial(createdId) : "BOND LIVE"}
            </p>
            <p className="mt-2 font-mono text-sm text-bone/60">
              {escrow ? formatGen(escrow) : ""} GEN locked ·{" "}
              {PLATFORM_LABELS[platform]}
            </p>
          </div>
          <div className="w-full space-y-3">
            {known ? (
              <>
                <Button
                  className="w-full"
                  onClick={() => {
                    navigator.clipboard.writeText(url).then(
                      () => setCopied(true),
                      () => setCopied(false)
                    );
                  }}
                >
                  {copied ? "Link copied ✓" : "Copy link for the creator"}
                </Button>
                <Link to={`/deal/${createdId}`} className="block">
                  <Button variant="ghost" className="w-full">
                    Open the bond
                  </Button>
                </Link>
              </>
            ) : (
              <Link to="/dashboard" className="block">
                <Button className="w-full">Find it on your dashboard</Button>
              </Link>
            )}
          </div>
        </StickerCard>
        <p className="max-w-md text-center font-mono text-xs text-bone/40">
          Send the link to {shortAddr(influencer.trim())} — they post, submit
          the URL, and the validators handle the rest.
        </p>
      </div>
    );
  }

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const submit = () => {
    if (!escrowOk || !influencerOk || !termsOk) return;
    create.mutate(
      {
        influencer: influencer.trim(),
        terms,
        platform,
        minLiveDays,
        escrow: escrow as bigint,
      },
      { onSuccess: (id) => setCreatedId(id ?? 0) }
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageItem>
        <h1 className="font-display text-4xl font-bold uppercase tracking-tight text-bone">
          Start a <span className="text-bond">bond</span>
        </h1>
      </PageItem>

      {/* progress */}
      <PageItem>
        {/* min-w-0 + a tighter label: at 320px the four full labels ("1.
            Parties" …) wrapped onto two lines and collided with each other, so
            below `sm` only the active step is named — the bars carry the rest. */}
        <ol className="flex gap-2">
          {STEPS.map((label, i) => (
            <li key={label} className="min-w-0 flex-1">
              <div
                className={`h-1.5 rounded-full ${
                  i < step ? "bg-bond" : i === step ? "bg-hype" : "bg-static"
                }`}
              />
              <span
                className={`mt-1.5 block truncate font-mono text-[10px] uppercase tracking-widest ${
                  i === step ? "text-hype" : "text-bone/35"
                }`}
              >
                {i + 1}.
                <span className={i === step ? "inline" : "hidden sm:inline"}>
                  {" "}
                  {label}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </PageItem>

      <PageItem>
        <StickerCard className="p-6 md:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={reduced ? false : { opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, x: -24 }}
              transition={{ duration: 0.22 }}
              className="space-y-6"
            >
              {step === 0 && (
                <>
                  <Field
                    label="Creator wallet address"
                    hint="the influencer who gets paid when the post verifies"
                    error={
                      influencer.trim() && !influencerOk
                        ? influencer.trim().toLowerCase() === me
                          ? "You can't bond with yourself."
                          : "That's not a valid 0x address."
                        : undefined
                    }
                  >
                    <TextInput
                      value={influencer}
                      onChange={(e) => setInfluencer(e.target.value)}
                      placeholder="0x…"
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </Field>
                  <div>
                    <span className="mb-2 block font-display text-xs font-bold uppercase tracking-widest text-bone/60">
                      Platform
                    </span>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {PLATFORMS.map((p) => (
                        <PlatformTile
                          key={p}
                          platform={p}
                          selected={platform === p}
                          onSelect={setPlatform}
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}

              {step === 1 && (
                <>
                  <Field
                    label="Escrow amount (GEN)"
                    hint="locked in the contract until the deal settles"
                    error={
                      amountStr && !escrowOk
                        ? `Enter at least ${MIN_ESCROW_LABEL} GEN — e.g. 500 or 1.5`
                        : undefined
                    }
                  >
                    <TextInput
                      value={amountStr}
                      onChange={(e) => setAmountStr(e.target.value)}
                      placeholder="500"
                      inputMode="decimal"
                      autoComplete="off"
                    />
                  </Field>
                  <Field
                    label={`Minimum live days: ${minLiveDays}`}
                    hint="the post must stay up this long before payout"
                  >
                    <input
                      type="range"
                      min={1}
                      max={30}
                      value={minLiveDays}
                      onChange={(e) => setMinLiveDays(Number(e.target.value))}
                      className="w-full"
                      aria-label="Minimum live days"
                    />
                    <div className="mt-1 flex justify-between font-mono text-[10px] text-bone/35">
                      <span>1 day</span>
                      <span>30 days</span>
                    </div>
                  </Field>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Must mention (handles)" hint="comma separated">
                      <TextInput
                        value={mentions}
                        onChange={(e) => setMentions(e.target.value)}
                        placeholder="@BrandName"
                        autoComplete="off"
                      />
                    </Field>
                    <Field label="Hashtags" hint="comma separated">
                      <TextInput
                        value={hashtags}
                        onChange={(e) => setHashtags(e.target.value)}
                        placeholder="#BrandCampaign"
                        autoComplete="off"
                      />
                    </Field>
                  </div>
                  <Field label="Required link" hint="leave empty if none">
                    <TextInput
                      value={link}
                      onChange={(e) => setLink(e.target.value)}
                      placeholder="brandsite.com"
                      autoComplete="off"
                    />
                  </Field>
                  <div className="flex flex-wrap gap-5">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-bone/80">
                      <input
                        type="checkbox"
                        checked={tone}
                        onChange={(e) => setTone(e.target.checked)}
                        className="h-4 w-4 accent-[#FF3D8A]"
                      />
                      Positive/neutral tone
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-bone/80">
                      <input
                        type="checkbox"
                        checked={originalOnly}
                        onChange={(e) => setOriginalOnly(e.target.checked)}
                        className="h-4 w-4 accent-[#FF3D8A]"
                      />
                      Original post only (no replies/reposts)
                    </label>
                  </div>
                  <Field
                    label="Extra requirements"
                    hint="one per line — written into the on-chain terms verbatim"
                  >
                    <TextArea
                      value={extra}
                      onChange={(e) => setExtra(e.target.value)}
                      rows={2}
                      placeholder="Must show the product on camera"
                    />
                  </Field>
                  <div>
                    <span className="mb-2 flex items-baseline justify-between font-display text-xs font-bold uppercase tracking-widest text-bone/60">
                      <span>Exact on-chain terms</span>
                      <span
                        className={`font-mono ${termsOk ? "text-bone/35" : "text-heat"}`}
                      >
                        {terms.length}/{TERMS_MAX}
                      </span>
                    </span>
                    <MonoBlock>{terms}</MonoBlock>
                    {!termsLengthOk ? (
                      <p className="mt-1.5 font-mono text-xs text-heat">
                        Terms must be {TERMS_MIN}–{TERMS_MAX} characters.
                      </p>
                    ) : termsIssue ? (
                      <p className="mt-1.5 font-mono text-xs text-heat">
                        {termsIssue}
                      </p>
                    ) : null}
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <div className="grid gap-3 font-mono text-sm text-bone/80 sm:grid-cols-2">
                    <div className="rounded-card border-2 border-static p-4">
                      <p className="text-[10px] uppercase tracking-widest text-bone/35">
                        creator
                      </p>
                      <p className="mt-1 break-all">{influencer.trim()}</p>
                    </div>
                    <div className="rounded-card border-2 border-static p-4">
                      <p className="text-[10px] uppercase tracking-widest text-bone/35">
                        escrow
                      </p>
                      <p className="mt-1 font-display text-2xl font-bold text-bone">
                        {escrow ? formatGen(escrow) : "—"}{" "}
                        <span className="text-sm text-bone/40">GEN</span>
                      </p>
                    </div>
                    <div className="rounded-card border-2 border-static p-4">
                      <p className="text-[10px] uppercase tracking-widest text-bone/35">
                        platform
                      </p>
                      <p className="mt-1">{PLATFORM_LABELS[platform]}</p>
                    </div>
                    <div className="rounded-card border-2 border-static p-4">
                      <p className="text-[10px] uppercase tracking-widest text-bone/35">
                        live window
                      </p>
                      <p className="mt-1">{minLiveDays} days</p>
                    </div>
                  </div>
                  <MonoBlock>{terms}</MonoBlock>
                  {create.isError && (
                    <ErrorStrip>
                      {create.error instanceof Error
                        ? create.error.message
                        : "The transaction failed."}
                    </ErrorStrip>
                  )}
                  {create.isPending && (
                    <BondingLoader
                      lines={[
                        "locking the bag…",
                        "minting the bond…",
                        "waiting for consensus…",
                      ]}
                    />
                  )}
                </>
              )}
            </motion.div>
          </AnimatePresence>

          {/* The final label ("Lock 500 GEN & mint bond") is long enough to
              crush "Back" at 320px, so the pair wraps instead of squeezing. */}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t-2 border-static pt-6">
            <Button
              variant="ghost"
              onClick={back}
              disabled={step === 0 || create.isPending}
              className="!px-4"
            >
              Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={next} disabled={!stepOk}>
                Continue
              </Button>
            ) : (
              <Button
                onClick={submit}
                loading={create.isPending}
                className="min-w-0 flex-1 !px-4 text-center sm:flex-none sm:!px-5"
              >
                Lock {escrow ? formatGen(escrow) : ""} GEN &amp; mint bond
              </Button>
            )}
          </div>
        </StickerCard>
      </PageItem>
    </div>
  );
}
