import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Import from "@/pages/Import";
import ImportHistory from "@/pages/ImportHistory";
import Accounts from "@/pages/Accounts";
import Categories from "@/pages/Categories";
import Budget from "@/pages/Budget";
import Transfers from "@/pages/Transfers";
import TransferPreferences from "@/pages/TransferPreferences";
import Settings from "@/pages/Settings";
import Goals from "@/pages/Goals";
import Crypto from "@/pages/Crypto";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Layout>
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
