import { useCompanion } from "./CompanionProvider";
import { Brain, X } from "lucide-react";
import { useEffect, useState } from "react";

export function CompanionBubble() {
  const { comment, dismiss, enabled } = useCompanion();
  const [visible, setVisible] = useState(false);
  const [currentText, setCurrentText] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<number | null>(null);

  // Animate in/out
  useEffect(() => {
    if (comment && enabled) {
      setCurrentText(comment.text);
      setCurrentId(comment.id);
      // Small delay before fade-in for mount
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
      // Clear text after fade-out animation
      const timer = setTimeout(() => {
        setCurrentText(null);
        setCurrentId(null);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [comment, enabled]);

  if (!currentText) return null;

  return (
    <div
      key={currentId}
      className={`fixed bottom-6 right-6 z-50 flex items-end gap-3 max-w-sm transition-all duration-300 ease-out ${
        visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-2 pointer-events-none"
      }`}
    >
      {/* Speech bubble */}
      <div className="relative bg-slate-800/90 backdrop-blur-sm border border-slate-700/60 rounded-2xl rounded-br-md px-4 py-3 shadow-lg shadow-black/20">
        <button
          onClick={dismiss}
          className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center hover:bg-slate-600 transition-colors"
          aria-label="Dismiss companion comment"
        >
          <X className="h-3 w-3 text-slate-400" />
        </button>
        <p className="text-sm text-slate-300 leading-relaxed pr-2">
          {currentText}
        </p>
      </div>

      {/* Avatar */}
      <div className="flex-shrink-0 h-10 w-10 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
        <Brain className="h-5 w-5 text-blue-400" />
      </div>
    </div>
  );
}
