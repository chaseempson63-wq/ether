import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-ether-bg px-6">
      <div className="text-center max-w-md">
        {/* Breathing violet dot — reuses the etherBreathe keyframe */}
        <svg
          width="16"
          height="16"
          viewBox="-10 -10 20 20"
          className="mx-auto mb-8"
          aria-hidden="true"
        >
          <circle
            cx="0"
            cy="0"
            r="4"
            fill="var(--ether-violet)"
            opacity="0.5"
            style={{
              transformOrigin: "0 0",
              animation: "etherBreathe 4s ease-in-out infinite alternate",
            }}
          />
        </svg>

        <h1 className="font-display text-xl text-slate-100 mb-3 tracking-tight">
          This thought hasn&rsquo;t formed yet.
        </h1>
        <p className="font-ui text-sm text-slate-500 mb-8 leading-relaxed">
          The path you followed leads nowhere the mind has been yet.
        </p>

        <button
          type="button"
          onClick={() => setLocation("/dashboard")}
          className="btn-primary"
        >
          Return to your mind
        </button>
      </div>
    </div>
  );
}
