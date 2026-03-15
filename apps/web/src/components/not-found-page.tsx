import { Button } from "@based-chat/ui/components/button";

export function NotFoundPage() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background p-4">
      {/* Subtle radial gradient background */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(0.20_0.02_195/0.15),transparent_70%)]" />

      <div className="relative z-10 flex w-full max-w-md flex-col items-center text-center">
        {/* Glass card */}
        <div className="w-full rounded-2xl border border-border/60 bg-card/50 p-8 backdrop-blur-sm">
          <div className="flex flex-col items-center">
            {/* 404 indicator */}
            <div className="relative mb-2">
              <span className="font-mono text-5xl font-bold tracking-tighter text-foreground/10">
                404
              </span>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="size-10 rounded-full border border-muted-foreground/20 bg-muted/30 backdrop-blur-sm flex items-center justify-center">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    fill="none"
                    className="text-muted-foreground"
                  >
                    <circle
                      cx="9"
                      cy="9"
                      r="7"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    <path
                      d="M6.5 7.5L8 9L6.5 10.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <line
                      x1="9.5"
                      y1="7.5"
                      x2="9.5"
                      y2="10.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </div>
            </div>

            <h1 className="mt-3 text-lg font-semibold tracking-tight text-foreground">
              Page not found
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              The page you're looking for doesn't exist or has been moved.
            </p>

            {/* Action button */}
            <div className="mt-6">
              <Button
                size="sm"
                onClick={() => {
                  window.location.href = "/";
                }}
              >
                Go Home
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
