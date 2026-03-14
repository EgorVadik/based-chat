import { Button } from "@based-chat/ui/components/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@based-chat/ui/components/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@based-chat/ui/components/dropdown-menu";
import { Avatar, AvatarFallback } from "@based-chat/ui/components/avatar";
import { cn } from "@based-chat/ui/lib/utils";
import {
  MessageSquarePlus,
  Search,
  Settings,
  LogOut,
  ChevronsUpDown,
  MessageSquare,
  Trash2,
} from "lucide-react";
import type { Conversation } from "@/lib/fake-data";
import { getConversationsByTimeGroup } from "@/lib/fake-data";

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex size-7 items-center justify-center rounded-lg bg-primary">
        <span className="text-xs font-bold text-primary-foreground tracking-tighter font-mono">
          B
        </span>
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-semibold tracking-tight leading-none">
          Based Chat
        </span>
        <span className="text-[10px] text-muted-foreground mt-0.5 font-mono uppercase tracking-widest">
          v0.1.0
        </span>
      </div>
    </div>
  );
}

function getModelDotColor(provider: string) {
  switch (provider) {
    case "Anthropic":
      return "bg-[oklch(0.72_0.17_195)]";
    case "OpenAI":
      return "bg-[oklch(0.72_0.15_145)]";
    case "Google":
      return "bg-[oklch(0.72_0.16_60)]";
    case "DeepSeek":
      return "bg-[oklch(0.65_0.18_270)]";
    default:
      return "bg-muted-foreground";
  }
}

export default function AppSidebar({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewChat,
}: {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
}) {
  const groups = getConversationsByTimeGroup(conversations);

  return (
    <Sidebar>
      <SidebarHeader className="gap-3">
        <div className="flex items-center justify-between">
          <BrandMark />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onNewChat}
            className="text-muted-foreground hover:text-foreground"
          >
            <MessageSquarePlus className="size-4" />
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/60" />
          <input
            type="text"
            placeholder="Search conversations..."
            className="w-full rounded-lg bg-sidebar-accent/50 border-0 pl-8 pr-3 py-1.5 text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:bg-sidebar-accent transition-colors"
          />
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-widest font-mono text-sidebar-foreground/40 font-normal px-3">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.conversations.map((conv) => (
                  <SidebarMenuItem key={conv.id}>
                    <SidebarMenuButton
                      isActive={conv.id === activeConversationId}
                      onClick={() => onSelectConversation(conv.id)}
                      className="group/conv"
                    >
                      <div
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          getModelDotColor(conv.model.provider),
                        )}
                      />
                      <span className="truncate">{conv.title}</span>
                      <button
                        className="ml-auto opacity-0 group-hover/conv:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarSeparator />

      <SidebarFooter>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left hover:bg-sidebar-accent transition-colors">
                <Avatar size="sm">
                  <AvatarFallback className="bg-primary/15 text-primary text-[10px] font-semibold">
                    AT
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">Ali Tamer</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    ali@based.chat
                  </p>
                </div>
                <ChevronsUpDown className="size-3.5 text-muted-foreground" />
              </button>
            }
          />
          <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-56">
            <DropdownMenuItem>
              <Settings className="size-3.5" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <MessageSquare className="size-3.5" />
              <span>Feedback</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">
              <LogOut className="size-3.5" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
