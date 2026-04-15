import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Brain, X, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useCompanion } from "./CompanionProvider";

export function EtherAvatar() {
  const [, setLocation] = useLocation();
  const { comment, dismiss, enabled } = useCompanion();
  const [expanded, setExpanded] = useState(false);
  const [seen, setSeen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const nudgeQuery = trpc.home.nudge.useQuery(undefined, {
    staleTime: 5 * 60_000,
  });

  const nudge = nudgeQuery.data;
  const hasNudge = !!nudge && !seen;

  // Show trigger-based comments by auto-expanding
  useEffect(() => {
    if (comment && enabled) {
      setExpanded(true);
    }
  }, [comment, enabled]);

  // Auto-dismiss trigger comment after 10s
  useEffect(() => {
    if (!comment || !expanded) return;
    const timer = setTimeout(() => {
      dismiss();
    }, 10_000);
    return () => clearTimeout(timer);
  }, [comment, expanded, dismiss]);

  // Close panel on outside click
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setExpanded(false);
        if (comment) dismiss();
      }
    };
    // Delay listener so the avatar click doesn't immediately close
    const timer = setTimeout(() => {
      document.addEventListener("click", handler);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handler);
    };
  }, [expanded, comment, dismiss]);

  const handleAvatarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (expanded) {
      setExpanded(false);
      if (comment) dismiss();
    } else {
      setExpanded(true);
      setSeen(true);
    }
  };

  const handleCTA = (href: string) => {
    setExpanded(false);
    setLocation(href);
  };

  // Decide what to show in the panel
  const panelContent = comment && enabled
    ? { message: comment.text, cta: null }
    : nudge
      ? { message: nudge.message, cta: nudge.cta }
      : null;

  return (
    <div className="fixed bottom-6 right-6 z-[1000] font-sora" ref={panelRef}>
      {/* Expanded nudge panel */}
      {expanded && panelContent && (
        <div
          className="absolute bottom-14 right-0 w-[280px] rounded-lg p-4 animate-float-in"
          style={{
            background: "rgba(8,11,20,0.92)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}
        >
          <div className="flex items-start justify-between gap-2 mb-3">
            <p className="text-[12px] text-[#e2e8f0] leading-relaxed">
              {panelContent.message}
            </p>
            <button
              onClick={() => {
                setExpanded(false);
                if (comment) dismiss();
              }}
              className="text-slate-600 hover:text-slate-400 flex-shrink-0"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          {panelContent.cta && (
            <button
              onClick={() => handleCTA(panelContent.cta!.href)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-[11px] font-semibold text-white rounded-md transition-colors"
            >
              {panelContent.cta.label}
              <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {/* Avatar circle */}
      <div className="relative">
        {/* Notification ping ring */}
        {hasNudge && !expanded && (
          <div
            className="absolute inset-0 rounded-full animate-avatar-ping"
            style={{ border: "2px solid rgba(59,130,246,0.5)" }}
          />
        )}
        <button
          onClick={handleAvatarClick}
          className="relative w-10 h-10 rounded-full flex items-center justify-center animate-avatar-float transition-colors"
          style={{
            background: "rgba(8,11,20,0.9)",
            border: "1px solid rgba(59,130,246,0.2)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
        >
          <Brain className="h-4 w-4 text-blue-500" />
        </button>
      </div>
    </div>
  );
}
