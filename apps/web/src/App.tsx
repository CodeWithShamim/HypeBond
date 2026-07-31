import { useState } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WalletProvider } from "@/lib/wallet";
import { ToastProvider } from "@/lib/toast";
import { BootLoader } from "@/components/motion/BootLoader";
import { PageFrame } from "@/components/motion/PageTransition";
import { Shell } from "@/components/Shell";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Landing } from "@/pages/Landing";
import { NewDeal } from "@/pages/NewDeal";
import { DealPage } from "@/pages/DealPage";
import { Dashboard } from "@/pages/Dashboard";
import { Docs } from "@/pages/Docs";
import { NotFound } from "@/pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5_000 },
  },
});

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route
          path="/"
          element={
            <PageFrame>
              <Landing />
            </PageFrame>
          }
        />
        <Route
          path="/new"
          element={
            <PageFrame>
              <NewDeal />
            </PageFrame>
          }
        />
        <Route
          path="/deal/:id"
          element={
            <PageFrame>
              <DealPage />
            </PageFrame>
          }
        />
        <Route
          path="/dashboard"
          element={
            <PageFrame>
              <Dashboard />
            </PageFrame>
          }
        />
        <Route
          path="/docs"
          element={
            <PageFrame>
              <Docs />
            </PageFrame>
          }
        />
        <Route
          path="*"
          element={
            <PageFrame>
              <NotFound />
            </PageFrame>
          }
        />
      </Routes>
    </AnimatePresence>
  );
}

export default function App() {
  const [booted, setBooted] = useState(false);
  return (
    <QueryClientProvider client={queryClient}>
      <WalletProvider>
        <ToastProvider>
          {!booted && <BootLoader onComplete={() => setBooted(true)} />}
          <Shell>
            {/* Inside the Shell so a crashed route keeps nav + wallet usable. */}
            <ErrorBoundary>
              <AnimatedRoutes />
            </ErrorBoundary>
          </Shell>
        </ToastProvider>
      </WalletProvider>
    </QueryClientProvider>
  );
}
