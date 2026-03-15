import { useState } from "react";
import {
  useRouter,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { Button } from "@based-chat/ui/components/button";

function ErrorIcon() {
  return (
    <div className="relative size-16 mb-2">
      {/* Outer glow ring */}
      <div className="absolute inset-0 rounded-full bg-destructive/10 animate-pulse" />
      {/* Inner circle */}
      <div className="absolute inset-2 rounded-full border border-destructive/30 bg-destructive/5 backdrop-blur-sm" />
      {/* Exclamation mark */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <div className="h-5 w-[2.5px] rounded-full bg-destructive" />
        <div className="size-[3px] rounded-full bg-destructive" />
      </div>
    </div>
  );
}

export function ErrorPage({ error }: ErrorComponentProps) {
  const router = useRouter();
  const [showDetails, setShowDetails] = useState(false);

  const errorMessage =
    error instanceof Error ? error.message : "An unexpected error occurred.";
  const errorStack = error instanceof Error ? error.stack : String(error);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background p-4">
      {/* Subtle radial gradient background */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(0.20_0.02_195/0.15),transparent_70%)]" />

      <div className="relative z-10 flex w-full max-w-md flex-col items-center text-center">
        {/* Glass card */}
        <div className="w-full rounded-2xl border border-border/60 bg-card/50 p-8 backdrop-blur-sm">
          <div className="flex flex-col items-center">
            <ErrorIcon />

            <h1 className="mt-3 text-lg font-semibold tracking-tight text-foreground">
              Something went wrong
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {errorMessage}
            </p>

            {/* Action buttons */}
            <div className="mt-6 flex items-center gap-2.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.location.href = "/";
                }}
              >
                Go Home
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  router.invalidate();
                }}
              >
                Try Again
              </Button>
            </div>

            {/* Collapsible details */}
            {errorStack && (
              <div className="mt-6 w-full">
                <button
                  type="button"
                  onClick={() => setShowDetails((v) => !v)}
                  className="mx-auto flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    className={`transition-transform duration-200 ${showDetails ? "rotate-90" : ""}`}
                  >
                    <path
                      d="M4.5 3L7.5 6L4.5 9"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {showDetails ? "Hide" : "Show"} details
                </button>

                <div
                  className={`grid transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    showDetails
                      ? "mt-3 grid-rows-[1fr] opacity-100"
                      : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <pre className="thin-scrollbar max-h-48 overflow-auto rounded-lg border border-border/40 bg-background/80 p-3 text-left font-mono text-[11px] leading-relaxed text-muted-foreground">
                      {errorStack}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
