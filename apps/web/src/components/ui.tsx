import { motion, useReducedMotion } from "framer-motion";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import type { DealStatus } from "@hypebond/shared";

// ---------------------------------------------------------------- button

type ButtonVariant = "primary" | "ghost" | "danger" | "volt";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: "bg-bond text-void font-bold",
  ghost: "border-2 border-static bg-transparent text-bone hover:border-pulse",
  danger: "border-2 border-heat bg-transparent text-heat hover:bg-heat/10",
  volt: "bg-volt text-void font-bold",
};

export function Button({
  variant = "primary",
  loading = false,
  children,
  className = "",
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  loading?: boolean;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.button
      whileTap={reduced || disabled || loading ? undefined : { scale: 0.96 }}
      transition={{ type: "spring", stiffness: 500, damping: 24 }}
      className={`inline-flex items-center justify-center gap-2 rounded-card px-5 py-3 font-display text-sm uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${BUTTON_STYLES[variant]} ${className}`}
      disabled={disabled || loading}
      {...(rest as object)}
    >
      {loading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </motion.button>
  );
}

// ---------------------------------------------------------------- sticker card

/** Solid panel on void: 2px static border, hard 12px corners, offset
 * "sticker shadow" in pulse. Hover lifts 4px and grows the shadow. */
export function StickerCard({
  children,
  className = "",
  hover = false,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      onClick={onClick}
      whileHover={
        hover && !reduced ? { y: -4, boxShadow: "8px 8px 0 0 #7A5CFF" } : undefined
      }
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      className={`rounded-card border-2 border-static bg-void shadow-sticker ${
        onClick ? "cursor-pointer" : ""
      } ${className}`}
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------- status chip

const CHIP_STYLES: Record<DealStatus, { bg: string; text: string; label: string }> = {
  FUNDED: { bg: "bg-pulse/15 border-pulse", text: "text-pulse", label: "Funded" },
  SUBMITTED: { bg: "bg-pulse/15 border-pulse", text: "text-pulse", label: "Checking" },
  GRACE_PERIOD: { bg: "bg-heat/15 border-heat", text: "text-heat", label: "Grace period" },
  VERIFYING: { bg: "bg-hype/15 border-hype", text: "text-hype", label: "Live window" },
  PAID: { bg: "bg-volt/15 border-volt", text: "text-volt", label: "Paid" },
  VERIFIED_FAIL: { bg: "bg-heat/15 border-heat", text: "text-heat", label: "Bond broken" },
  REFUNDED: { bg: "bg-static border-static", text: "text-bone/60", label: "Refunded" },
  CANCELLED: { bg: "bg-static border-static", text: "text-bone/60", label: "Cancelled" },
};

export function StatusChip({ status }: { status: DealStatus }) {
  const reduced = useReducedMotion();
  const s = CHIP_STYLES[status];
  return (
    <motion.span
      initial={reduced ? false : { scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 22 }}
      className={`inline-flex items-center rounded-full border px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider ${s.bg} ${s.text}`}
    >
      {s.label}
    </motion.span>
  );
}

// ---------------------------------------------------------------- forms

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-display text-xs font-bold uppercase tracking-widest text-bone/60">
        {label}
      </span>
      {children}
      {error ? (
        <span className="mt-1.5 block font-mono text-xs text-heat">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block font-mono text-xs text-bone/40">{hint}</span>
      ) : null}
    </label>
  );
}

const INPUT_CLASS =
  "w-full rounded-card border-2 border-static bg-void px-4 py-3 font-mono text-sm text-bone placeholder:text-bone/25 focus:border-pulse focus:outline-none transition-colors";

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return <input className={`${INPUT_CLASS} ${className}`} {...rest} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;
  return <textarea className={`${INPUT_CLASS} ${className}`} {...rest} />;
}

// ---------------------------------------------------------------- misc

/** Loud failure strip in heat — revert reasons, fail states. */
export function ErrorStrip({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-card border-2 border-heat bg-heat/10 px-4 py-3 font-mono text-sm text-heat">
      {children}
    </div>
  );
}

export function MonoBlock({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <pre
      className={`overflow-x-auto whitespace-pre-wrap rounded-card border-2 border-static bg-static/30 p-4 font-mono text-sm leading-relaxed text-bone/90 ${className}`}
    >
      {children}
    </pre>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-card border-2 border-dashed border-static px-6 py-16 text-center">
      <span className="font-display text-xl font-bold uppercase tracking-tight text-bone">
        {title}
      </span>
      <p className="max-w-sm text-sm text-bone/50">{body}</p>
      {action}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-bone md:text-3xl">
      {children}
    </h2>
  );
}
