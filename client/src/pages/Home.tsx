import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import {
  LayoutDashboard,
  Brain,
  MessageCircle,
  Zap,
  Calendar,
  Mic,
  Users,
  Network,
  LogOut,
} from "lucide-react";

const navItems = [
  { label: "Mind Map", description: "Explore your identity graph", href: "/mind-map", icon: Network },
  { label: "Dashboard", description: "View your memories, values, and decisions", href: "/dashboard", icon: LayoutDashboard },
  { label: "Halliday Interview", description: "Deep identity questions across 5 layers", href: "/halliday", icon: Brain },
  { label: "Persona Chat", description: "Talk to your digital mind", href: "/chat", icon: MessageCircle },
  { label: "Quick Memory", description: "Capture a thought right now", href: "/quick", icon: Zap },
  { label: "Daily Reflection", description: "Journal and reflect on your day", href: "/reflection", icon: Calendar },
  { label: "Interview Mode", description: "Guided conversational capture", href: "/interview", icon: Mic },
  { label: "Beneficiaries", description: "Manage who can access your mind", href: "/beneficiaries", icon: Users },
];

export default function Home() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-4xl font-bold">Ether</h1>
            <p className="text-slate-400 mt-1">Your Digital Mind. Living Forever.</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => { await logout(); setLocation("/login"); }}
            className="text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Log out
          </Button>
        </div>

        {user?.email && (
          <p className="text-slate-400 mb-8">Welcome back, <span className="text-white">{user.user_metadata?.name || user.email}</span></p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {navItems.map((item) => (
            <Card
              key={item.href}
              className="bg-slate-800/60 border-slate-700 hover:bg-slate-800 hover:border-slate-600 cursor-pointer transition-colors"
              onClick={() => setLocation(item.href)}
            >
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-3 text-lg">
                  <item.icon className="h-5 w-5 text-blue-400" />
                  {item.label}
                </CardTitle>
                <CardDescription className="text-slate-400">
                  {item.description}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>

        <div className="text-center text-slate-500 text-sm mt-12">
          <p>The End of Disappearing. Building the lineage of human intelligence.</p>
        </div>
      </div>
    </div>
  );
}
