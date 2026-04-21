import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const COLOR_HEX: Record<string, string> = {
  gold: "#FFD27A",
  cyan: "#3DD9FF",
  violet: "#8A7CFF",
  magenta: "#FF6FD1",
};

// One-liner caller: const evaluate = useAchievementToaster(); evaluate();
// Pops a toast for each newly-earned achievement and invalidates dashboard.
// Safe to call after any mutation — the server is idempotent (unique
// constraint on user_id + achievement_id), so double-fires are cheap.
export function useAchievementToaster(): () => void {
  const utils = trpc.useUtils();
  const mut = trpc.dashboard.evaluateAchievements.useMutation({
    onSuccess: (earned) => {
      if (!earned.length) return;
      for (const a of earned) {
        toast.success(`🏆 ${a.name}`, {
          description: a.sub,
          duration: 5000,
          style: {
            borderLeft: `3px solid ${COLOR_HEX[a.color] ?? "#FFD27A"}`,
          },
        });
      }
      utils.dashboard.get.invalidate();
    },
  });
  return () => mut.mutate();
}
