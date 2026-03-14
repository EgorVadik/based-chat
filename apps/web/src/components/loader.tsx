import { Skeleton } from "@based-chat/ui/components/skeleton";
import { cn } from "@based-chat/ui/lib/utils";
import { Loader2 } from "lucide-react";

type LoaderProps = {
  className?: string;
  variant?: "shell" | "compact";
};

function LoaderCard({
  className,
  title,
  lines,
}: {
  className?: string;
  title: string;
  lines: string[];
}) {
  return (
    <div className={cn("w-full max-w-sm", className)}>
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-muted text-primary">
            <Loader2 className="size-4 animate-spin" />
          </div>
          <div>
            <p className="text-sm font-medium tracking-tight">{title}</p>
            <p className="text-xs text-muted-foreground">Please wait a moment</p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {lines.map((width) => (
            <Skeleton key={width} className={cn("h-3 rounded-full bg-muted", width)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function CompactLoader({ className }: Pick<LoaderProps, "className">) {
  return (
    <LoaderCard
      className={className}
      title="Loading session"
      lines={["w-full", "w-4/5"]}
    />
  );
}

function ShellLoader({ className }: Pick<LoaderProps, "className">) {
  return (
    <div className={cn("flex min-h-svh items-center justify-center bg-background px-4", className)}>
      <LoaderCard
        title="Loading chat"
        lines={["w-full", "w-5/6", "w-2/3"]}
      />
    </div>
  );
}

export default function Loader({
  className,
  variant = "shell",
}: LoaderProps) {
  if (variant === "compact") {
    return <CompactLoader className={className} />;
  }

  return <ShellLoader className={className} />;
}
