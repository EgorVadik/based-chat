import { api } from "@based-chat/backend/convex/_generated/api";
import { Button } from "@based-chat/ui/components/button";
import { Input } from "@based-chat/ui/components/input";
import { Textarea } from "@based-chat/ui/components/textarea";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { Plus, X } from "lucide-react";
import { useEffect, useState, type KeyboardEvent } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/form";

const SUGGESTED_TRAITS = [
  "friendly",
  "witty",
  "concise",
  "curious",
  "empathetic",
  "creative",
  "patient",
];

const NAME_MAX = 50;
const ROLE_MAX = 100;
const TRAIT_MAX = 100;
const TRAITS_MAX_COUNT = 20;
const BIO_MAX = 3000;

const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required.")
    .max(NAME_MAX, `Name must be ${NAME_MAX} characters or fewer.`),
  role: z
    .string()
    .max(ROLE_MAX, `Role must be ${ROLE_MAX} characters or fewer.`),
  traits: z
    .array(
      z
        .string()
        .trim()
        .min(1, "Traits cannot be empty.")
        .max(TRAIT_MAX, `Traits must be ${TRAIT_MAX} characters or fewer.`),
    )
    .max(TRAITS_MAX_COUNT, `You can save up to ${TRAITS_MAX_COUNT} traits.`),
  bio: z
    .string()
    .max(BIO_MAX, `Bio must be ${BIO_MAX} characters or fewer.`),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

function normalizeTrait(trait: string) {
  return trait.trim().toLowerCase();
}

export default function ProfileTab({
  user,
}: {
  user: {
    name?: string | null;
    email?: string | null;
    role?: string | null;
    traits?: string[] | null;
    bio?: string | null;
  };
}) {
  const updateProfile = useMutation(
    (api.auth as { updateProfile: any }).updateProfile,
  );
  const [traitInput, setTraitInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user.name ?? "",
      role: user.role ?? "",
      traits: user.traits ?? [],
      bio: user.bio ?? "",
    },
  });
  const traits = form.watch("traits");
  const name = form.watch("name");
  const role = form.watch("role");
  const bio = form.watch("bio");

  useEffect(() => {
    form.reset({
      name: user.name ?? "",
      role: user.role ?? "",
      traits: user.traits ?? [],
      bio: user.bio ?? "",
    });
  }, [form, user.bio, user.name, user.role, user.traits]);

  const addTrait = (trait: string) => {
    const trimmed = normalizeTrait(trait);
    if (!trimmed) {
      setTraitInput("");
      return;
    }

    if (trimmed.length > TRAIT_MAX) {
      toast.error(`Traits must be ${TRAIT_MAX} characters or fewer.`);
      return;
    }

    if (traits.includes(trimmed)) {
      setTraitInput("");
      return;
    }

    if (traits.length >= TRAITS_MAX_COUNT) {
      toast.error(`You can save up to ${TRAITS_MAX_COUNT} traits.`);
      return;
    }

    if (trimmed) {
      form.setValue("traits", [...traits, trimmed], {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
    setTraitInput("");
  };

  const removeTrait = (trait: string) => {
    form.setValue(
      "traits",
      traits.filter((currentTrait) => currentTrait !== trait),
      {
        shouldDirty: true,
        shouldValidate: true,
      },
    );
  };

  const handleTraitKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === "Tab") && traitInput.trim()) {
      e.preventDefault();
      addTrait(traitInput);
    }
    if (e.key === "Backspace" && !traitInput && traits.length > 0) {
      form.setValue("traits", traits.slice(0, -1), {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  };

  const handleSubmit = form.handleSubmit(async (values) => {
    if (isSaving) {
      return;
    }

    setIsSaving(true);

    try {
      await updateProfile({
        name: values.name,
        role: values.role,
        traits: values.traits.map(normalizeTrait).filter(Boolean),
        bio: values.bio,
      });
      form.reset({
        name: values.name.trim(),
        role: values.role.trim(),
        traits: values.traits.map(normalizeTrait).filter(Boolean),
        bio: values.bio.trim(),
      });
      toast.success("Profile saved.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save profile.",
      );
    } finally {
      setIsSaving(false);
    }
  });

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          Customize Based Chat
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Personalize how Based Chat interacts with you.
        </p>
      </div>

      {/* Name */}
      <Form {...form}>
        <form className="space-y-10" onSubmit={handleSubmit}>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>What should Based Chat call you?</FormLabel>
                <div className="relative">
                  <FormControl>
                    <Input
                      placeholder="Enter your name"
                      {...field}
                      onChange={(event) => {
                        if (event.target.value.length <= NAME_MAX) {
                          field.onChange(event);
                        }
                      }}
                      className="h-10 rounded-xl border-border/50 bg-muted/30 pr-14 focus-visible:bg-muted/50"
                    />
                  </FormControl>
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground/50">
                    {name.length}/{NAME_MAX}
                  </span>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem>
                <FormLabel>What do you do?</FormLabel>
                <div className="relative">
                  <FormControl>
                    <Input
                      placeholder="Engineer, student, etc."
                      {...field}
                      onChange={(event) => {
                        if (event.target.value.length <= ROLE_MAX) {
                          field.onChange(event);
                        }
                      }}
                      className="h-10 rounded-xl border-border/50 bg-muted/30 pr-14 focus-visible:bg-muted/50"
                    />
                  </FormControl>
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground/50">
                    {role.length}/{ROLE_MAX}
                  </span>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="traits"
            render={() => (
              <FormItem>
                <FormLabel>What traits should Based Chat have?</FormLabel>
                <div className="relative">
                  <Input
                    placeholder="Type a trait and press Enter or Tab..."
                    value={traitInput}
                    onChange={(event) => {
                      if (event.target.value.length <= TRAIT_MAX) {
                        setTraitInput(event.target.value);
                      }
                    }}
                    onKeyDown={handleTraitKeyDown}
                    className="h-10 rounded-xl border-border/50 bg-muted/30 pr-14 focus-visible:bg-muted/50"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground/50">
                    {traitInput.length}/{TRAIT_MAX}
                  </span>
                </div>

                {traits.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {traits.map((trait) => (
                      <span
                        key={trait}
                        className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-medium text-primary"
                      >
                        {trait}
                        <button
                          type="button"
                          onClick={() => removeTrait(trait)}
                          className="cursor-pointer transition-colors hover:text-primary/70"
                        >
                          <X className="size-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {SUGGESTED_TRAITS.filter((trait) => !traits.includes(trait)).map(
                    (trait) => (
                      <button
                        key={trait}
                        type="button"
                        onClick={() => addTrait(trait)}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border/50 bg-muted/20 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                      >
                        {trait}
                        <Plus className="size-2.5" />
                      </button>
                    ),
                  )}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="bio"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Anything else Based Chat should know about you?
                </FormLabel>
                <div className="relative">
                  <FormControl>
                    <Textarea
                      placeholder="Interests, values, or preferences to keep in mind"
                      {...field}
                      onChange={(event) => {
                        if (event.target.value.length <= BIO_MAX) {
                          field.onChange(event);
                        }
                      }}
                      className="min-h-32 resize-none rounded-xl border-border/50 bg-muted/30 text-xs focus-visible:bg-muted/50"
                    />
                  </FormControl>
                  <span className="absolute bottom-3 right-3 text-[10px] font-mono text-muted-foreground/50">
                    {bio.length}/{BIO_MAX}
                  </span>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={isSaving || !form.formState.isDirty}
            >
              {isSaving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
