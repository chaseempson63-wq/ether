import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { AuthGuard } from "./components/AuthGuard";
import { CompanionProvider, CompanionBubble } from "./companion";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import HallidayInterview from "./pages/HallidayInterview";
import DailyReflection from "./pages/DailyReflection";
import PersonaChat from "./pages/PersonaChat";
import Dashboard from "./pages/Dashboard";
import InterviewMode from "./pages/InterviewMode";
import BeneficiaryManagement from "./pages/BeneficiaryManagement";
import QuickMemory from "./pages/QuickMemory";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Onboarding from "./pages/Onboarding";

/** Wrap a component so it requires authentication + companion context */
function Protected({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <CompanionProvider>
        {children}
        <CompanionBubble />
      </CompanionProvider>
    </AuthGuard>
  );
}

function Router() {
  return (
    <Switch>
      {/* Public routes */}
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />

      {/* Protected routes */}
      <Route path="/">{() => <Protected><Home /></Protected>}</Route>
      <Route path="/onboarding">{() => <Protected><Onboarding /></Protected>}</Route>
      <Route path="/halliday">{() => <Protected><HallidayInterview /></Protected>}</Route>
      <Route path="/quick">{() => <Protected><QuickMemory /></Protected>}</Route>
      <Route path="/dashboard">{() => <Protected><Dashboard /></Protected>}</Route>
      <Route path="/reflection">{() => <Protected><DailyReflection /></Protected>}</Route>
      <Route path="/interview">{() => <Protected><InterviewMode /></Protected>}</Route>
      <Route path="/chat">{() => <Protected><PersonaChat /></Protected>}</Route>
      <Route path="/beneficiaries">{() => <Protected><BeneficiaryManagement /></Protected>}</Route>

      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
