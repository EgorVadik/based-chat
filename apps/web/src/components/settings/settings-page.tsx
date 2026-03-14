import { Avatar, AvatarFallback } from "@based-chat/ui/components/avatar";
import { cn } from "@based-chat/ui/lib/utils";
import { useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import {
  SETTINGS_TABS,
  type SettingsTabId,
} from "@/lib/settings-tabs";

import ProfileTab from "./profile-tab";
import ThreadHistoryTab from "./thread-history-tab";
import ModelsTab from "./models-tab";
import AttachmentsTab from "./attachments-tab";
import ApiKeysTab from "./api-keys-tab";

export default function SettingsPage({
  user,
  activeTab,
  onTabChange,
}: {
  user: {
    name?: string | null;
    email?: string | null;
    role?: string | null;
    traits?: string[] | null;
    bio?: string | null;
  };
  activeTab: SettingsTabId;
  onTabChange: (tab: SettingsTabId) => void;
}) {
  const router = useRouter();

  const displayName =
    user.name?.trim() || user.email?.split("@")[0] || "User";
  const displayEmail = user.email || "No email";
  const initials =
    displayName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "BC";

  return (
    <div className="min-h-svh bg-background">
      {/* Top header */}
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <button
            onClick={() => router.navigate({ to: "/" })}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <ArrowLeft className="size-3.5" />
            <span>Back to Chat</span>
          </button>

          <button
            onClick={() => {
              authClient.signOut({
                fetchOptions: {
                  onSuccess: () => {
                    toast.success("Signed out.");
                  },
                  onError: (error) => {
                    toast.error(
                      error.error.message || error.error.statusText
                    );
                  },
                },
              });
            }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex gap-10">
          {/* Left panel — user card */}
          <aside className="hidden lg:flex w-60 shrink-0 flex-col items-center pt-4">
            {/* Avatar */}
            <div className="relative">
              <div className="size-32 rounded-full bg-gradient-to-br from-primary/30 via-primary/10 to-transparent p-0.5">
                <div className="flex size-full items-center justify-center rounded-full bg-background">
                  <Avatar className="size-28">
                    <AvatarFallback className="bg-primary/10 text-primary text-3xl font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </div>
            </div>

            <h2 className="mt-4 text-sm font-semibold truncate max-w-full">
              {displayName}
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground truncate max-w-full">
              {displayEmail}
            </p>

            {/* Keyboard shortcuts */}
            <div className="mt-8 w-full rounded-xl border border-border/50 bg-card/30 p-4 space-y-3">
              <h3 className="text-xs font-medium">Keyboard Shortcuts</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    Search
                  </span>
                  <div className="flex items-center gap-0.5">
                    <kbd className="flex size-5 items-center justify-center rounded border border-border/60 bg-muted/40 text-[9px] font-mono text-muted-foreground">
                      ⌘
                    </kbd>
                    <kbd className="flex size-5 items-center justify-center rounded border border-border/60 bg-muted/40 text-[9px] font-mono text-muted-foreground">
                      K
                    </kbd>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    New Chat
                  </span>
                  <div className="flex items-center gap-0.5">
                    <kbd className="flex size-5 items-center justify-center rounded border border-border/60 bg-muted/40 text-[9px] font-mono text-muted-foreground">
                      ⌘
                    </kbd>
                    <kbd className="flex size-5 items-center justify-center rounded border border-border/60 bg-muted/40 text-[9px] font-mono text-muted-foreground">
                      ⇧
                    </kbd>
                    <kbd className="flex size-5 items-center justify-center rounded border border-border/60 bg-muted/40 text-[9px] font-mono text-muted-foreground">
                      O
                    </kbd>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    Settings
                  </span>
                  <div className="flex items-center gap-0.5">
                    <kbd className="flex size-5 items-center justify-center rounded border border-border/60 bg-muted/40 text-[9px] font-mono text-muted-foreground">
                      ⌘
                    </kbd>
                    <kbd className="flex size-5 items-center justify-center rounded border border-border/60 bg-muted/40 text-[9px] font-mono text-muted-foreground">
                      ,
                    </kbd>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          {/* Right panel — tabs + content */}
          <div className="flex-1 min-w-0">
            {/* Horizontal tab bar */}
            <nav className="flex items-center gap-1 border-b border-border/50 overflow-x-auto">
              {SETTINGS_TABS.map((tab) => {
                const isActive = activeTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    className={cn(
                      "relative shrink-0 px-3 py-2.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap",
                      isActive
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {tab.label}
                    {isActive && (
                      <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-foreground" />
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Tab content */}
            <div className="py-8">
              {activeTab === "profile" && <ProfileTab user={user} />}
              {activeTab === "threads" && <ThreadHistoryTab />}
              {activeTab === "models" && <ModelsTab />}
              {activeTab === "attachments" && <AttachmentsTab />}
              {activeTab === "api-keys" && <ApiKeysTab />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
