import { Button } from "@based-chat/ui/components/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@based-chat/ui/components/card";
import { Input } from "@based-chat/ui/components/input";
import { Label } from "@based-chat/ui/components/label";
import { cn } from "@based-chat/ui/lib/utils";
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { ArrowRight, KeyRound, Mail } from "lucide-react";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

function getErrorMessage(error: string | { message?: string } | undefined) {
  return typeof error === "string" ? error : error?.message;
}

function FieldError({
  errors,
}: {
  errors: Array<string | { message?: string } | undefined>;
}) {
  if (!errors.length) return null;

  return (
    <p className="text-[11px] font-medium text-destructive">
      {getErrorMessage(errors[0])}
    </p>
  );
}

export default function SignInForm() {
  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signIn.email(
        {
          email: value.email,
          password: value.password,
        },
        {
          onSuccess: () => {
            toast.success("Welcome back.");
          },
          onError: (error) => {
            toast.error(error.error.message || error.error.statusText);
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.string().email("Enter a valid email address"),
        password: z.string().min(8, "Password must be at least 8 characters"),
      }),
    },
  });

  return (
    <Card className="overflow-hidden rounded-3xl border border-border/60 bg-card/90 py-0 shadow-xl shadow-black/5 backdrop-blur-sm dark:shadow-black/30">
      <CardHeader className="border-b border-border/50 px-6 py-6">
        <CardTitle className="text-2xl font-semibold tracking-tight">
          Sign in
        </CardTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Use your existing account to continue to chat.
        </p>
      </CardHeader>

      <CardContent className="px-6 py-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="space-y-4"
        >
          <form.Field name="email">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name} className="text-[11px] uppercase tracking-[0.22em]">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
                  <Input
                    id={field.name}
                    name={field.name}
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="h-12 rounded-xl border-border/60 bg-background/70 pl-9 text-sm shadow-none dark:bg-input/20"
                  />
                </div>
                <FieldError errors={field.state.meta.errors} />
              </div>
            )}
          </form.Field>

          <form.Field name="password">
            {(field) => (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor={field.name}
                    className="text-[11px] uppercase tracking-[0.22em]"
                  >
                    Password
                  </Label>
                  <span className="text-[11px] text-muted-foreground">
                    Minimum 8 characters
                  </span>
                </div>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
                  <Input
                    id={field.name}
                    name={field.name}
                    type="password"
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="h-12 rounded-xl border-border/60 bg-background/70 pl-9 text-sm shadow-none dark:bg-input/20"
                  />
                </div>
                <FieldError errors={field.state.meta.errors} />
              </div>
            )}
          </form.Field>

          <form.Subscribe
            selector={(state) => ({
              canSubmit: state.canSubmit,
              isSubmitting: state.isSubmitting,
            })}
          >
            {({ canSubmit, isSubmitting }) => (
              <Button
                type="submit"
                disabled={!canSubmit || isSubmitting}
                className={cn("h-12 w-full rounded-xl text-sm", isSubmitting && "animate-pulse")}
              >
                {isSubmitting ? "Signing in..." : "Continue"}
                {!isSubmitting && <ArrowRight className="size-4" />}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </CardContent>

      <CardFooter className="border-t border-border/50 px-6 py-4 text-xs text-muted-foreground">
        New here?
        <Link
          to="/sign-up"
          className="ml-1 font-medium text-primary transition-colors hover:text-primary/80"
        >
          Create an account
        </Link>
      </CardFooter>
    </Card>
  );
}
