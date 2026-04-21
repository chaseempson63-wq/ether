import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useEffect } from "react";

/**
 * Route guard that redirects unauthenticated users to /login.
 * Also redirects to /onboarding if onboarding is not yet complete
 * (unless the user is already on /onboarding).
 * Shows nothing while auth state is loading to avoid flash of content.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const [location, setLocation] = useLocation();

  // Only fetch onboarding status when authenticated
  const onboardingQuery = trpc.onboarding.status.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [loading, isAuthenticated, setLocation]);

  // Redirect to /onboarding if not complete (skip if already there)
  useEffect(() => {
    if (
      isAuthenticated &&
      onboardingQuery.data &&
      !onboardingQuery.data.onboardingComplete &&
      location !== "/onboarding"
    ) {
      setLocation("/onboarding");
    }
  }, [isAuthenticated, onboardingQuery.data, location, setLocation]);

  if (loading || (isAuthenticated && onboardingQuery.isLoading)) {
    return (
      <div className="min-h-screen bg-ether-bg flex items-center justify-center">
        <div className="animate-pulse text-slate-400 text-sm">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
