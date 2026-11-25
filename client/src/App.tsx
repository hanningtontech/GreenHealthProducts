import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import Admin from "@/pages/Admin";
import Home from "@/pages/Home";
import Profile from "@/pages/Profile";
import PatientResults from "@/pages/PatientResults";
import PatientIntake from "@/pages/PatientIntake";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { bindKnowledgeBankSyncListeners } from "@/lib/knowledgeBank";

function Router() {
  return <Switch>
    <Route path="/admin" component={Admin} />
    <Route path="/profile" component={Profile} />
    <Route path="/results/:id" component={PatientResults} />
    <Route path="/results" component={PatientResults} />
    <Route path="/help" component={PatientIntake} />
    <Route path="/404" component={NotFound} />
    <Route component={Home} />
  </Switch>;
}

export default function App() {
  useEffect(() => {
    bindKnowledgeBankSyncListeners();
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
