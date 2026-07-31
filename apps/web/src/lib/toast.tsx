import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

export type ToastKind = "pending" | "success" | "error";

interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  detail?: string;
}

interface ToastApi {
  /** Fire-and-forget toast. Returns the toast id. */
  push: (kind: ToastKind, title: string, detail?: string) => number;
  /** Morph an existing toast (pending → success/error, same verb). */
  update: (id: number, kind: ToastKind, title: string, detail?: string) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const KIND_STYLE: Record<ToastKind, { border: string; dot: string }> = {
  pending: { border: "border-pulse", dot: "bg-pulse" },
  success: { border: "border-volt", dot: "bg-volt" },
  error: { border: "border-heat", dot: "bg-heat" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const reduced = useReducedMotion();

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, title: string, detail?: string) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-3), { id, kind, title, detail }]);
      if (kind !== "pending") setTimeout(() => dismiss(id), 6000);
      return id;
    },
    [dismiss]
  );

  const update = useCallback(
    (id: number, kind: ToastKind, title: string, detail?: string) => {
      setToasts((t) =>
        t.map((x) => (x.id === id ? { ...x, kind, title, detail } : x))
      );
      if (kind !== "pending") setTimeout(() => dismiss(id), 6000);
    },
    [dismiss]
  );

  const api = useMemo(() => ({ push, update, dismiss }), [push, update, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Sits above the mobile tab bar and the home indicator below it. */}
      <div className="pointer-events-none fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-[90] flex w-[min(92vw,340px)] flex-col gap-2 md:bottom-6">
        <AnimatePresence>
          {toasts.map((t) => {
            const s = KIND_STYLE[t.kind];
            return (
              <motion.div
                key={t.id}
                layout={!reduced}
                initial={reduced ? false : { opacity: 0, y: 16, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, x: 60 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className={`pointer-events-auto rounded-card border-2 ${s.border} bg-void shadow-sticker`}
              >
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  className="flex w-full items-start gap-3 p-3 text-left"
                >
                  <span className="mt-1 flex h-2.5 w-2.5 shrink-0">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${s.dot} ${
                        t.kind === "pending" && !reduced ? "animate-pulse" : ""
                      }`}
                    />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-display text-sm font-bold uppercase tracking-wide text-bone">
                      {t.title}
                    </span>
                    {t.detail && (
                      <span className="mt-0.5 block break-words font-mono text-xs text-bone/60">
                        {t.detail}
                      </span>
                    )}
                  </span>
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast outside ToastProvider");
  return ctx;
}
