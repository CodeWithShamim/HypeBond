import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { PageItem } from "@/components/motion/PageTransition";
import { Marquee } from "@/components/motion/Marquee";
import { Seal } from "@/components/motion/Seal";
import { Button, SectionTitle, StickerCard } from "@/components/ui";

const FAKE_VERIFICATIONS = [
  "@nova_mkt → @kaicreates ✦ 500 GEN ✦ VERIFIED",
  "@glowlabs → @mia.reels ✦ 1 200 GEN ✦ VERIFIED",
  "@peakfuel → @tomruns ✦ 350 GEN ✦ VERIFIED",
  "@bytebrew → @devdana ✦ 800 GEN ✦ VERIFIED",
  "@moonwear → @styleby.j ✦ 2 000 GEN ✦ VERIFIED",
  "@fizzdrink → @foodie.finn ✦ 640 GEN ✦ VERIFIED",
];

const PROBLEMS = [
  {
    title: "Ghosted payments",
    body: "The post goes up, the invoice goes out, the brand goes quiet. Creators eat the loss because chasing a brand across borders costs more than the deal.",
  },
  {
    title: "Deleted posts",
    body: "Paid upfront, posted for 24 hours, gone by Monday. The brand bought a billboard that evaporated — and has zero recourse.",
  },
  {
    title: "The 30% referee",
    body: "Agencies exist mostly to make both sides behave. They charge up to a third of the deal to forward emails and screenshot posts.",
  },
];

const FAQS = [
  {
    q: "How does verification actually work?",
    a: "GenLayer validators each independently fetch your post URL from the live web, read the content, and judge it against the deal terms written on-chain. They reach consensus on each requirement — pass releases the escrow to the creator, fail refunds the brand. No oracle, no screenshots, no he-said-she-said.",
  },
  {
    q: "What if my post fails the first check?",
    a: "You get a 48-hour grace period with the AI's exact reason for the failure. Fix the post (or post again) and resubmit the URL. If the window lapses with no fix, the brand can reclaim the escrow.",
  },
  {
    q: "What stops a brand from never paying?",
    a: "The brand pays when the deal is created — the money sits in the contract, not in their promise. If the final verification passes, nothing the brand does can stop the payout.",
  },
  {
    q: "What stops a creator from deleting the post after payout?",
    a: "The deal specifies a minimum live window (1–30 days). Final verification only runs after that window, and the validators re-fetch the post to confirm it is still live before any money moves.",
  },
  {
    q: "Can someone trick the AI judge with hidden text?",
    a: "The fetched page is treated as untrusted data: it's wrapped in explicit delimiters and the judge is instructed to ignore any instructions found inside it. Unparseable or manipulated verdicts fail closed — the escrow never moves on a broken verification.",
  },
];

function StepCard({
  n,
  title,
  body,
  seal,
}: {
  n: string;
  title: string;
  body: string;
  seal?: boolean;
}) {
  const reduced = useReducedMotion();
  return (
    <StickerCard className="relative h-full overflow-visible p-6">
      <span className="font-mono text-xs font-bold text-hype">{n}</span>
      <h3 className="mt-2 font-display text-xl font-bold uppercase tracking-tight text-bone">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-bone/60">{body}</p>
      {seal && (
        <motion.div
          className="absolute -right-4 -top-6"
          initial={reduced ? undefined : { opacity: 0 }}
          whileInView={reduced ? undefined : { opacity: 1 }}
          viewport={{ once: true, amount: 0.6 }}
        >
          <motion.div
            initial={reduced ? false : { scale: 1.6, rotate: -14, opacity: 0 }}
            whileInView={{ scale: 1, rotate: -6, opacity: 1 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ type: "spring", stiffness: 420, damping: 22 }}
          >
            <Seal verdict="pass" size={92} slam={false} />
          </motion.div>
        </motion.div>
      )}
    </StickerCard>
  );
}

export function Landing() {
  const reduced = useReducedMotion();

  return (
    <div className="space-y-20 md:space-y-28">
      {/* ---------- hero ---------- */}
      <PageItem>
        <section className="relative pt-8 md:pt-16">
          {/* slow-rotating gradient seal behind the type */}
          {!reduced && (
            <div
              aria-hidden
              className="bg-bond animate-spinSlow absolute -top-10 right-0 -z-10 h-64 w-64 rounded-full opacity-25 blur-2xl md:h-96 md:w-96"
            />
          )}
          <h1 className="font-display text-[17vw] font-bold uppercase leading-[0.9] tracking-tighter text-bone md:text-[7.5rem]">
            Hype,
            <br />
            <span className="text-bond">bonded.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-bone/60">
            Lock a sponsorship deal on-chain in plain English. Payment sits in
            escrow. GenLayer's AI validators fetch the actual live post and
            release the bag only when the terms are met.{" "}
            <span className="text-bone">
              No agencies. No trust. No ghosting.
            </span>
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link to="/new">
              <Button className="!px-8 !py-4 text-base">Start a bond</Button>
            </Link>
            <Link to="/dashboard">
              <Button variant="ghost" className="!px-8 !py-4 text-base">
                View bonds
              </Button>
            </Link>
          </div>
        </section>
      </PageItem>

      {/* ---------- live-style verification marquee ---------- */}
      <PageItem>
        <Marquee className="border-y-2 border-static py-3">
          {FAKE_VERIFICATIONS.map((v, i) => (
            <span
              key={i}
              className="mx-6 font-mono text-sm uppercase tracking-wider text-bone/50"
            >
              {v.replace("VERIFIED", "")}
              <span className="text-volt">VERIFIED</span>
            </span>
          ))}
        </Marquee>
      </PageItem>

      {/* ---------- three-step flow ---------- */}
      <PageItem>
        <section>
          <SectionTitle>The deal checks itself</SectionTitle>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <StepCard
              n="01"
              title="Bond the hype"
              body="The brand writes the terms in plain English — mentions, hashtags, link, tone — and locks the payment in escrow. The terms are the contract, literally."
            />
            <StepCard
              n="02"
              title="Post & submit"
              body="The creator posts on X, Instagram, YouTube or TikTok and drops the URL. An instant AI check confirms the content matches before the clock starts."
            />
            <StepCard
              n="03"
              title="Validators fetch the real post"
              body="After the live window, validators re-fetch the URL, verify every requirement by consensus, and the escrow releases automatically. Bag secured."
              seal
            />
          </div>
        </section>
      </PageItem>

      {/* ---------- problem ---------- */}
      <PageItem>
        <section>
          <SectionTitle>
            A $30B market running on{" "}
            <span className="text-heat">screenshots</span>
          </SectionTitle>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {PROBLEMS.map((p) => (
              <div
                key={p.title}
                className="rounded-card border-2 border-static p-6"
              >
                <h3 className="font-display text-lg font-bold uppercase tracking-tight text-heat">
                  {p.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-bone/60">
                  {p.body}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-8 max-w-2xl text-bone/60">
            HypeBond replaces the referee with validators that can literally
            open the post and read it. Almost no other chain can natively
            answer{" "}
            <span className="font-mono text-sm text-bone">
              "is this tweet still live and does it mention the brand?"
            </span>
          </p>
        </section>
      </PageItem>

      {/* ---------- FAQ ---------- */}
      <PageItem>
        <section>
          <SectionTitle>FAQ</SectionTitle>
          <div className="mt-8 space-y-3">
            {FAQS.map((f) => (
              <details
                key={f.q}
                className="group rounded-card border-2 border-static p-5 open:border-pulse"
              >
                <summary className="cursor-pointer list-none font-display text-base font-bold uppercase tracking-tight text-bone marker:content-none">
                  <span className="mr-2 font-mono text-pulse group-open:hidden">＋</span>
                  <span className="mr-2 hidden font-mono text-pulse group-open:inline">－</span>
                  {f.q}
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-bone/60">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </PageItem>

      {/* ---------- CTA ---------- */}
      <PageItem>
        <section className="rounded-card border-2 border-static p-8 text-center md:p-14">
          <h2 className="font-display text-4xl font-bold uppercase tracking-tight text-bone md:text-5xl">
            Release the <span className="text-bond">bag</span>
          </h2>
          <p className="mx-auto mt-4 max-w-md text-bone/60">
            Bond the hype, verify the post, get paid. Deals that enforce
            themselves.
          </p>
          <Link to="/new" className="mt-8 inline-block">
            <Button className="!px-10 !py-4 text-base">Start a bond</Button>
          </Link>
        </section>
      </PageItem>
    </div>
  );
}
