import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain, BookOpen, MessageSquare, Zap } from "lucide-react";
import { useLocation } from "wouter";

export default function Home() {
  const { user, isAuthenticated, logout } = useAuth();
  const [, setLocation] = useLocation();

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

        {!isAuthenticated ? (
          <div className="text-center mb-16">
            <Button
              onClick={() => setLocation("/register")}
              size="lg"
              className="bg-blue-600 hover:bg-blue-700"
            >
              Get Started
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <Card
              className="bg-slate-800 border-slate-700 cursor-pointer hover:bg-slate-700 transition border-2 border-blue-500"
              onClick={() => setLocation("/halliday")}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Zap className="h-5 w-5 text-blue-400" />
                  Halliday Interview
                </CardTitle>
                <CardDescription className="text-slate-400">Build your Digital Mind</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-slate-300 text-sm">Answer 140+ questions across 5 categories to teach the AI how you think and feel.</p>
              </CardContent>
            </Card>

            <Card
              className="bg-slate-800 border-slate-700 cursor-pointer hover:bg-slate-700 transition"
              onClick={() => setLocation("/quick")}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Zap className="h-5 w-5 text-blue-400" />
                  Quick Memory
                </CardTitle>
                <CardDescription className="text-slate-400">Capture a thought before it's gone.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-slate-300 text-sm">One tap. Speak. Saved. The fastest way to put something into Ether.</p>
              </CardContent>
            </Card>

            <Card
              className="bg-slate-800 border-slate-700 cursor-pointer hover:bg-slate-700 transition"
              onClick={() => setLocation("/dashboard")}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Brain className="h-5 w-5" />
                  Dashboard
                </CardTitle>
                <CardDescription className="text-slate-400">View your memories and patterns</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-slate-300 text-sm">See your captured thoughts, decisions, and core values at a glance.</p>
              </CardContent>
            </Card>

            <Card
              className="bg-slate-800 border-slate-700 cursor-pointer hover:bg-slate-700 transition"
              onClick={() => setLocation("/reflection")}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <BookOpen className="h-5 w-5" />
                  Daily Reflection
                </CardTitle>
                <CardDescription className="text-slate-400">Capture your thoughts</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-slate-300 text-sm">Record memories, decisions, and values to build your Digital Mind.</p>
              </CardContent>
            </Card>

            <Card
              className="bg-slate-800 border-slate-700 cursor-pointer hover:bg-slate-700 transition"
              onClick={() => setLocation("/chat")}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <MessageSquare className="h-5 w-5" />
                  Talk to Yourself
                </CardTitle>
                <CardDescription className="text-slate-400">Chat with your Digital Mind</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-slate-300 text-sm">Get advice based on your own reasoning and values.</p>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="text-center text-slate-400 text-sm mt-16">
          {isAuthenticated && (
            <Button variant="ghost" onClick={logout} className="text-slate-400 hover:text-white">
              Logout
            </Button>
          )}
          <p className="mt-4">The End of Disappearing. Building the lineage of human intelligence.</p>
        </div>
      </div>
    </div>
  );
}
