import { useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, LogIn } from "lucide-react";

export default function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setIsLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    window.location.href = "/";
  };

  return (
    <div className="min-h-screen bg-ether-bg flex items-center justify-center p-6">
      <Card className="w-full max-w-md bg-white/[0.04] border-white/[0.06]">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-white">Ether</CardTitle>
          <CardDescription className="text-slate-400">
            Sign in to your Digital Mind
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
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Signing in…</>
              ) : (
                <><LogIn className="h-4 w-4 mr-2" /> Log in</>
              )}
            </Button>

            <p className="text-center text-sm text-slate-400">
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => setLocation("/register")}
                className="text-ether-violet hover:text-ether-violet/80 underline"
              >
                Register
              </button>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
