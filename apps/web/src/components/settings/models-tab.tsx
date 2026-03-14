import { api } from "@based-chat/backend/convex/_generated/api";
import { Button } from "@based-chat/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@based-chat/ui/components/dropdown-menu";
import { Input } from "@based-chat/ui/components/input";
import { cn } from "@based-chat/ui/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  Brain,
  ChevronDown,
  Eye,
  Filter,
  Image,
  Search,
  Star,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { MODELS, type Model, type ModelCapability } from "@/lib/models";

const CAPABILITY_META: Record<
  ModelCapability,
  { icon: typeof Eye; label: string }
> = {
  vision: { icon: Eye, label: "Vision" },
  tools: { icon: Wrench, label: "Tools" },
  reasoning: { icon: Brain, label: "Reasoning" },
  "image-gen": { icon: Image, label: "Image Gen" },
};

type FilterMode = "all" | "favorites" | "non-favorites";

const FILTER_LABELS: Record<FilterMode, string> = {
  all: "All",
  favorites: "Favorites",
  "non-favorites": "Non-favorites",
};

export default function ModelsTab() {
  const favoriteModelIds = useQuery(api.favoriteModels.list, {});
  const toggleFavorite = useMutation(api.favoriteModels.toggle);
  const [optimisticFavoriteIds, setOptimisticFavoriteIds] = useState<string[] | null>(
    null,
  );
  const [pendingFavoriteIds, setPendingFavoriteIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");

  useEffect(() => {
    if (favoriteModelIds !== undefined) {
      setOptimisticFavoriteIds(favoriteModelIds);
    }
  }, [favoriteModelIds]);

  const activeFavoriteIds = optimisticFavoriteIds ?? favoriteModelIds ?? [];
  const favoriteIdSet = useMemo(
    () => new Set(activeFavoriteIds),
    [activeFavoriteIds],
  );

  const handleToggleFavorite = async (modelId: string) => {
    if (pendingFavoriteIds.includes(modelId)) {
      return;
    }

    const currentFavoriteIds = optimisticFavoriteIds ?? favoriteModelIds ?? [];
    const nextFavoriteIds = currentFavoriteIds.includes(modelId)
      ? currentFavoriteIds.filter((id) => id !== modelId)
      : [...currentFavoriteIds, modelId];

    setOptimisticFavoriteIds(nextFavoriteIds);
    setPendingFavoriteIds((current) => [...current, modelId]);

    try {
      await toggleFavorite({ modelId });
    } catch {
      setOptimisticFavoriteIds(currentFavoriteIds);
      toast.error("Could not update favorites right now.");
    } finally {
      setPendingFavoriteIds((current) =>
        current.filter((pendingId) => pendingId !== modelId),
      );
    }
  };

  const filteredModels = useMemo(() => {
    let models = MODELS;

    if (filter === "favorites") {
      models = models.filter((m) => favoriteIdSet.has(m.id));
    } else if (filter === "non-favorites") {
      models = models.filter((m) => !favoriteIdSet.has(m.id));
    }

    if (search.trim()) {
      const query = search.toLowerCase();
      models = models.filter(
        (m) =>
          m.name.toLowerCase().includes(query) ||
          m.provider.toLowerCase().includes(query) ||
          m.description.toLowerCase().includes(query),
      );
    }

    return models;
  }, [favoriteIdSet, search, filter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Models</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose which models appear in your selector, and read more about their
          capabilities.
        </p>
      </div>

      {/* Search + Filter bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/50" />
          <Input
            placeholder="Search models..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 rounded-lg bg-muted/30 border-border/50 pl-9 focus-visible:bg-muted/50"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 shrink-0"
              >
                <Filter className="size-3" />
                <span>{FILTER_LABELS[filter]}</span>
                <ChevronDown className="size-3 text-muted-foreground" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-36">
            {(Object.keys(FILTER_LABELS) as FilterMode[]).map((mode) => (
              <DropdownMenuItem
                key={mode}
                onClick={() => setFilter(mode)}
                className={cn(filter === mode && "text-primary font-medium")}
              >
                {FILTER_LABELS[mode]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Models list */}
      <div className="divide-y divide-border/40">
        {filteredModels.map((model) => (
          <ModelRow
            key={model.id}
            model={model}
            isFavorite={favoriteIdSet.has(model.id)}
            isPending={pendingFavoriteIds.includes(model.id)}
            onToggleFavorite={() => handleToggleFavorite(model.id)}
          />
        ))}
        {filteredModels.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-xs text-muted-foreground/50">
              No models found.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ModelRow({
  model,
  isFavorite,
  isPending,
  onToggleFavorite,
}: {
  model: Model;
  isFavorite: boolean;
  isPending: boolean;
  onToggleFavorite: () => void;
}) {
  return (
    <div className="group flex items-center gap-3.5 py-3 px-1">
      {/* Provider icon */}
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/40 text-[10px] font-bold font-mono text-muted-foreground uppercase">
        {model.provider.slice(0, 2)}
      </div>

      {/* Model info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{model.name}</p>
          {model.badge && (
            <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold text-primary uppercase tracking-wider">
              {model.badge}
            </span>
          )}
          <span className="shrink-0 text-[10px] text-muted-foreground/50 font-mono">
            {model.pricing}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground truncate">
          {model.description}
        </p>
      </div>

      {/* Capabilities */}
      <div className="hidden sm:flex items-center gap-1">
        {model.capabilities.map((cap) => {
          const meta = CAPABILITY_META[cap];
          const Icon = meta.icon;
          return (
            <div
              key={cap}
              title={meta.label}
              className="flex size-5 items-center justify-center rounded text-muted-foreground/30"
            >
              <Icon className="size-3" />
            </div>
          );
        })}
      </div>

      {/* Favorite toggle */}
      <button
        onClick={onToggleFavorite}
        disabled={isPending}
        type="button"
        className={cn(
          "shrink-0 p-1 rounded transition-colors cursor-pointer",
          isFavorite
            ? "text-primary hover:text-primary/80"
            : "text-muted-foreground/20 hover:text-primary/50",
          isPending && "cursor-not-allowed opacity-50",
        )}
      >
        <Star className={cn("size-4", isFavorite && "fill-current")} />
      </button>
    </div>
  );
}
