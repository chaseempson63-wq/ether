export type BreathingDotProps = {
  /** Dot fill color. Defaults to slate-500 per the design spec. Pass
   *  "white" or "currentColor" from EtherButton when the surface behind
   *  the dot is already colored. */
  color?: string;
  /** Dot diameter in px. Default 6. */
  size?: number;
  className?: string;
};

// Three dots, staggered, reusing etherBreathe (scale 0.6→1.0 + opacity).
// transform-origin is centered here (the Dashboard core uses 0,0 because
// its SVG viewBox is centered on origin; a DOM element has its own box).
export function BreathingDot({
  color = "rgb(100 116 139)", // slate-500 hex literal so it works inside buttons
  size = 6,
  className,
}: BreathingDotProps) {
  const delays = [0, 0.2, 0.4];
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className ?? ""}`}
      aria-label="Loading"
      role="status"
    >
      {delays.map((delay) => (
        <span
          key={delay}
          className="block rounded-full"
          style={{
            width: size,
            height: size,
            background: color,
            transformOrigin: "center",
            animation: "etherBreathe 1.2s ease-in-out infinite alternate",
            animationDelay: `${delay}s`,
          }}
        />
      ))}
    </span>
  );
}
