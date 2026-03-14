import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";

import { ModeToggle } from "@/components/mode-toggle";
import Loader from "@/components/loader";
import SignUpForm from "@/components/sign-up-form";

export const Route = createFileRoute("/sign-up")({
  component: SignUpPage,
});

function SignUpPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" />;
  }

  return (
    <div className="relative min-h-svh overflow-hidden bg-background">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,color-mix(in_oklab,var(--primary)_16%,transparent),transparent_34%)]" />
      <div className="relative mx-auto flex min-h-svh max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <span className="font-mono text-sm font-bold tracking-tight">B</span>
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight">Based Chat</p>
              <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
                Sign up
              </p>
            </div>
          </Link>
          <ModeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-md">
            <SignUpForm />
          </div>
        </div>
      </div>
    </div>
  );
}
