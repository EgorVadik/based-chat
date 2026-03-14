import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex items-center justify-center h-svh">
      <p className="text-muted-foreground text-sm">Dashboard coming soon.</p>
    </div>
  );
}
