const DECIMALS = 18n;
const ONE = 10n ** DECIMALS;

/** Format a wei amount as GEN, trimmed to a sane precision. */
export function formatGen(wei: bigint, maxFrac = 4): string {
  const negative = wei < 0n;
  const abs = negative ? -wei : wei;
  const whole = abs / ONE;
  const frac = abs % ONE;
  let out = whole.toString();
  if (frac > 0n && maxFrac > 0) {
    const fracStr = frac.toString().padStart(18, "0").slice(0, maxFrac);
    const trimmed = fracStr.replace(/0+$/, "");
    if (trimmed) out += "." + trimmed;
  }
  return (negative ? "-" : "") + out;
}

/** Parse a user-entered GEN amount ("1.5") into wei. Null if invalid. */
export function parseGen(input: string): bigint | null {
  const s = input.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const fracPadded = (frac + "0".repeat(18)).slice(0, 18);
  const value = BigInt(whole) * ONE + BigInt(fracPadded);
  return value;
}

export function shortAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function formatDate(tsSec: number): string {
  if (!tsSec) return "—";
  return new Date(tsSec * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
}

export function countdownTo(tsSec: number, nowMs: number): CountdownParts {
  const left = tsSec * 1000 - nowMs;
  if (left <= 0)
    return { days: 0, hours: 0, minutes: 0, seconds: 0, done: true };
  const s = Math.floor(left / 1000);
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
    done: false,
  };
}

export function countdownLabel(c: CountdownParts): string {
  if (c.done) return "00:00:00";
  const hh = String(c.hours).padStart(2, "0");
  const mm = String(c.minutes).padStart(2, "0");
  const ss = String(c.seconds).padStart(2, "0");
  return c.days > 0 ? `${c.days}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}

/** Surface contract revert reasons / wallet errors as human copy. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message;
    if (/user rejected|denied|rejected the request/i.test(msg))
      return "You rejected the wallet request.";
    const revert = msg.match(/UserError[:(]\s*'?([^')\n]+)/i);
    if (revert) return revert[1];
    return msg.length > 200 ? msg.slice(0, 200) + "…" : msg;
  }
  return String(err);
}
