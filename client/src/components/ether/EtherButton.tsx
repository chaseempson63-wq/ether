import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { BreathingDot } from "./BreathingDot";
import { cn } from "@/lib/utils";

export type EtherButtonVariant = "primary" | "ghost" | "destructive" | "earned";

export type EtherButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: EtherButtonVariant;
  loading?: boolean;
  children?: ReactNode;
};

// Destruction in Ether is quiet, not alarming — a muted rose, not red.
const DESTRUCTIVE_HEX = "#E07A9A";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-ui font-medium text-sm px-5 py-2.5 transition-all duration-[180ms] ease-out disabled:opacity-50 disabled:cursor-not-allowed select-none";

const VARIANT: Record<EtherButtonVariant, string> = {
  primary:
    "bg-ether-violet text-white hover:shadow-[0_0_24px_0_rgba(138,124,255,0.35)] hover:bg-[color-mix(in_oklab,var(--ether-violet),white_8%)] active:translate-y-px",
  ghost:
    "bg-transparent border border-white/10 text-slate-200 hover:bg-white/5 hover:border-white/20 active:translate-y-px",
  destructive:
    "text-white hover:shadow-[0_0_20px_0_rgba(224,122,154,0.35)] hover:brightness-110 active:translate-y-px",
  earned:
    "bg-ether-gold text-slate-950 hover:shadow-[0_0_24px_0_rgba(255,210,122,0.4)] hover:brightness-105 active:translate-y-px",
};

export const EtherButton = forwardRef<HTMLButtonElement, EtherButtonProps>(
  function EtherButton(
    { variant = "primary", loading, disabled, className, children, style, ...rest },
    ref,
  ) {
    const mergedStyle: React.CSSProperties =
      variant === "destructive"
        ? { background: DESTRUCTIVE_HEX, ...style }
        : style ?? {};
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        data-ether-variant={variant}
        className={cn(BASE, VARIANT[variant], className)}
        style={mergedStyle}
        {...rest}
      >
        {loading ? (
          <BreathingDot
            color={
              variant === "ghost" || variant === "earned" ? "currentColor" : "white"
            }
          />
        ) : (
          children
        )}
      </button>
    );
  },
);
