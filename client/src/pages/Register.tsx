import { useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, UserPlus } from "lucide-react";

export default function Register() {
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });

    setIsLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    // If Supabase has email confirmation enabled, session will be null
    if (!data.session) {
      setCheckEmail(true);
      return;
    }

    // New users always go straight to onboarding
    window.location.href = "/onboarding";
  };

  if (checkEmail) {
    return (
      <div className="min-h-screen bg-ether-bg flex items-center justify-center p-6">
        <Card className="w-full max-w-md bg-white/[0.04] border-white/[0.06]">
          <CardContent className="p-12 text-center">
            <h2 className="text-2xl font-bold text-white mb-4">Check your email</h2>
            <p className="text-slate-400 mb-6">
              We sent a confirmation link to <strong className="text-white">{email}</strong>.
              Click the link to activate your account.
            </p>
            <Button
              onClick={() => setLocation("/login")}
              variant="outline"
              className="border-white/[0.06] text-white hover:bg-white/[0.04]"
            >
              Back to login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ether-bg flex items-center justify-center p-6">
      <Card className="w-full max-w-md bg-white/[0.04] border-white/[0.06]">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-white">Join Ether</CardTitle>
          <CardDescription className="text-slate-400">
            Create your Digital Mind account
          </CardDescription>
        </CardHeader>
        <CardContent className="p-12">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-ether-magenta/10 border border-ether-magenta/30 text-ether-magenta text-sm rounded-lg p-3">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-slate-300">Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="bg-white/[0.04] border-white/[0.06] text-white placeholder:text-slate-500"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-slate-300">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-white/[0.04] border-white/[0.06] text-white placeholder:text-slate-500"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-slate-300">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="bg-white/[0.04] border-white/[0.06] text-white placeholder:text-slate-500"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-password" className="text-slate-300">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="bg-white/[0.04] border-white/[0.06] text-white placeholder:text-slate-500"
              />
            </div>

            <Button
              type="submit"
              data-ether-variant="primary"
              className="w-full bg-ether-violet hover:bg-ether-violet/90 text-white"
              disabled={isLoading}
            >
              {isLoading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating account…</>
              ) : (
                <><UserPlus className="h-4 w-4 mr-2" /> Register</>
              )}
            </Button>

            <p className="text-center text-sm text-slate-400">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => setLocation("/login")}
                className="text-ether-violet hover:text-ether-violet/80 underline"
              >
                Log in
              </button>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
