import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button, StickerCard } from "./ui";

interface Props {
  children: ReactNode;
  /** Rendered instead of the default panel, e.g. for a smaller region. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time crashes so a bad deal payload or a wallet extension
 * throwing mid-render degrades to a readable panel instead of a white
 * screen. Chain data is only as well-formed as the node returns it, and a
 * blank page gives the user nothing to act on — not even the deal id.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // No telemetry backend here — the console is the only sink, and losing
    // the component stack makes these effectively unreportable.
    console.error("HypeBond crashed while rendering:", error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div className="flex justify-center py-16">
        <StickerCard className="w-full max-w-lg space-y-4 p-6">
          <h1 className="font-display text-2xl font-bold uppercase tracking-tight text-heat">
            Something broke
          </h1>
          <p className="text-sm text-bone/60">
            The page hit an unexpected error. Your escrow is untouched — this is
            a display problem, not a chain problem.
          </p>
          <pre className="overflow-x-auto rounded-card border-2 border-static bg-static/30 p-3 font-mono text-xs text-bone/70">
            {error.message || String(error)}
          </pre>
          <div className="flex flex-wrap gap-3">
            <Button onClick={this.reset}>Try again</Button>
            <Button variant="ghost" onClick={() => window.location.reload()}>
              Reload the app
            </Button>
          </div>
        </StickerCard>
      </div>
    );
  }
}
