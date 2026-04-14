import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useEffect } from "react";

export default function Home() {
  const { isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();

  // Authenticated users should never see the landing page —
  // redirect to /dashboard (AuthGuard there handles onboarding check)
  useEffect(() => {
    if (!loading && isAuthenticated) {
      setLocation("/dashboard");
    }
  }, [loading, isAuthenticated, setLocation]);

  // Show nothing while auth is loading or redirecting
  if (loading || isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 flex items-center justify-center">
        <div className="animate-pulse text-slate-400 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      <div className="max-w-6xl mx-auto px-8 py-16">
        <div className="mb-16 text-center">
          <h1 className="text-6xl font-bold mb-4">Ether</h1>
          <p className="text-2xl text-slate-300 mb-8">Your Digital Mind. Living Forever.</p>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Capture your thoughts, decisions, and values. Build an AI that thinks like you.
            Leave your wisdom for your loved ones.
          </p>
        </div>

        <div className="text-center mb-16 space-x-4">
          <Button
            onClick={() => setLocation("/register")}
            size="lg"
            className="bg-blue-600 hover:bg-blue-700"
          >
            Get Started
          </Button>
          <Button
            onClick={() => setLocation("/login")}
            size="lg"
            variant="outline"
            className="border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            Log in
          </Button>
        </div>

        <div className="text-center text-slate-400 text-sm mt-16">
          <p>The End of Disappearing. Building the lineage of human intelligence.</p>
        </div>
      </div>
    </div>
  );
}
