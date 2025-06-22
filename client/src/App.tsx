import React, { Suspense, lazy } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

// Lazy load all page components for code splitting
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Import = lazy(() => import("@/pages/Import"));
const ImportHistory = lazy(() => import("@/pages/ImportHistory"));
const Accounts = lazy(() => import("@/pages/Accounts"));
const Categories = lazy(() => import("@/pages/Categories"));
const Budget = lazy(() => import("@/pages/Budget"));
const Transfers = lazy(() => import("@/pages/Transfers"));
const TransferPreferences = lazy(() => import("@/pages/TransferPreferences"));
const Settings = lazy(() => import("@/pages/Settings"));
const Goals = lazy(() => import("@/pages/Goals"));
const Crypto = lazy(() => import("@/pages/Crypto"));
const NotFound = lazy(() => import("@/pages/not-found"));

// Loading component for lazy routes
function PageLoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Card className="w-64">
        <CardContent className="flex flex-col items-center justify-center p-6">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    </div>
  );
}

// Error boundary component for lazy routes
class RouteErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Route loading error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-[400px]">
          <Card className="w-96">
            <CardContent className="flex flex-col items-center justify-center p-6">
              <div className="h-8 w-8 rounded-full bg-destructive/20 flex items-center justify-center mb-2">
                <span className="text-destructive text-sm">!</span>
              </div>
              <p className="text-sm text-muted-foreground text-center">
                Something went wrong loading this page. Please refresh and try again.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="mt-3 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
              >
                Refresh Page
              </button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

function Router() {
  return (
    <Layout>
      <RouteErrorBoundary>
        <Suspense fallback={<PageLoadingSpinner />}>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/import" component={Import} />
            <Route path="/import-history" component={ImportHistory} />
            <Route path="/accounts" component={Accounts} />
            <Route path="/categories" component={Categories} />
            <Route path="/budget" component={Budget} />
            <Route path="/transfers" component={Transfers} />
            <Route path="/transfer-preferences" component={TransferPreferences} />
            <Route path="/settings" component={Settings} />
            <Route path="/goals" component={Goals} />
            <Route path="/crypto" component={Crypto} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </RouteErrorBoundary>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
