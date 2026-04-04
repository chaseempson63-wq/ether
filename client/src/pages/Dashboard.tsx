import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, Calendar, Brain, Heart } from "lucide-react";
import { useLocation } from "wouter";

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const memoriesQuery = trpc.memory.list.useQuery();
  const reasoningQuery = trpc.reasoning.list.useQuery();
  const valuesQuery = trpc.values.list.useQuery();
  const profileQuery = trpc.profile.get.useQuery();

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Please log in to access your Dashboard</p>
      </div>
    );
  }

  const isLoading = memoriesQuery.isLoading || reasoningQuery.isLoading || valuesQuery.isLoading;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Your Digital Mind Dashboard</h1>
          <p className="text-slate-600">
            {profileQuery.data?.headline || "Welcome to your Ether profile"}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Memories
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{memoriesQuery.data?.length || 0}</div>
              <p className="text-xs text-slate-600">Total memories captured</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Brain className="h-4 w-4" />
                Decisions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{reasoningQuery.data?.length || 0}</div>
              <p className="text-xs text-slate-600">Reasoning patterns logged</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Heart className="h-4 w-4" />
                Values
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{valuesQuery.data?.length || 0}</div>
              <p className="text-xs text-slate-600">Core values defined</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card>
            <CardHeader>
              <CardTitle>Recent Memories</CardTitle>
              <CardDescription>Your captured thoughts and experiences</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : memoriesQuery.data && memoriesQuery.data.length > 0 ? (
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {memoriesQuery.data.slice(0, 10).map((memory: any) => (
                    <div key={memory.id} className="border-l-2 border-blue-500 pl-3 py-2">
                      <p className="text-sm text-slate-900 line-clamp-2">{memory.content}</p>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">
                          {memory.sourceType === "journal" && "Journal"}
                          {memory.sourceType === "voice_memo" && "Voice"}
                          {memory.sourceType === "interview" && "Interview"}
                          {memory.sourceType === "passive_import" && "Imported"}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-2">
                        {new Date(memory.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-slate-500 mb-4">No memories yet.</p>
                  <Button onClick={() => setLocation("/reflection")} size="sm">
                    Start Capturing
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Your Core Values</CardTitle>
              <CardDescription>Principles that guide your decisions</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : valuesQuery.data && valuesQuery.data.length > 0 ? (
                <div className="space-y-4 max-h-[400px] overflow-y-auto">
                  {valuesQuery.data.map((value: any) => (
                    <div key={value.id} className="border rounded-lg p-3">
                      <div className="flex items-start justify-between mb-2">
                        <p className="font-semibold text-sm text-slate-900">{value.valueStatement}</p>
                        <Badge variant="outline" className="text-xs">
                          Priority {value.priority}
                        </Badge>
                      </div>
                      {value.beliefContext && (
                        <p className="text-sm text-slate-600">{value.beliefContext}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-slate-500 mb-4">No core values defined yet.</p>
                  <Button onClick={() => setLocation("/reflection")} size="sm">
                    Define Values
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Decision Patterns</CardTitle>
            <CardDescription>Major decisions and your reasoning behind them</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : reasoningQuery.data && reasoningQuery.data.length > 0 ? (
              <div className="space-y-4">
                {reasoningQuery.data.slice(0, 5).map((reasoning: any) => (
                  <div key={reasoning.id} className="border rounded-lg p-4">
                    <h3 className="font-semibold text-slate-900 mb-2">{reasoning.decision}</h3>
                    <p className="text-sm text-slate-700 mb-3">{reasoning.logicWhy}</p>
                    {reasoning.outcome && (
                      <div className="bg-slate-50 p-2 rounded text-sm text-slate-600 mb-2">
                        <strong>Outcome:</strong> {reasoning.outcome}
                      </div>
                    )}
                    <p className="text-xs text-slate-500 mt-2">
                      {new Date(reasoning.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-slate-500 mb-4">No decision patterns logged yet.</p>
                <Button onClick={() => setLocation("/reflection")} size="sm">
                  Log a Decision
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-8 text-center">
          <Button onClick={() => setLocation("/chat")} size="lg" className="mr-4">
            Talk to Your Digital Mind
          </Button>
          <Button onClick={() => setLocation("/reflection")} variant="outline" size="lg">
            Add More Data
          </Button>
        </div>
      </div>
    </div>
  );
}
