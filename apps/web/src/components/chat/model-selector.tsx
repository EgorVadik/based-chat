import { api } from "@based-chat/backend/convex/_generated/api";
import { cn } from "@based-chat/ui/lib/utils";
import { Popover } from "@base-ui/react/popover";
import { useMutation, useQuery } from "convex/react";
import {
  Brain,
  ChevronDown,
  Eye,
  ImagePlus,
  Info,
  LayoutGrid,
  Search,
  Star,
  Wrench,
} from "lucide-react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import {
  MODELS,
  PROVIDERS,
  type Model,
  type ModelCapability,
} from "@/lib/fake-data";

type ModelFilter = "all" | "favorites" | (typeof PROVIDERS)[number]["id"];

function getProviderColor(provider: string) {
  switch (provider) {
    case "Anthropic":
      return "bg-[oklch(0.72_0.17_195)]";
    case "OpenAI":
      return "bg-[oklch(0.72_0.15_145)]";
    case "Google":
      return "bg-[oklch(0.72_0.16_60)]";
    case "Meta":
      return "bg-[oklch(0.65_0.15_250)]";
    case "DeepSeek":
      return "bg-[oklch(0.65_0.18_270)]";
    default:
      return "bg-muted-foreground";
  }
}

function PricingBadge({ pricing }: { pricing: string }) {
  return (
    <span className="text-[10px] font-mono text-muted-foreground/60 tracking-tight">
      {pricing}
    </span>
  );
}

const CAPABILITY_CONFIG: Record<
  ModelCapability,
  { icon: typeof Eye; label: string }
> = {
  vision: { icon: Eye, label: "Vision" },
  tools: { icon: Wrench, label: "Tool use" },
  reasoning: { icon: Brain, label: "Reasoning" },
  "image-gen": { icon: ImagePlus, label: "Image generation" },
};

function CapabilityIcon({ capability }: { capability: ModelCapability }) {
  const config = CAPABILITY_CONFIG[capability];
  const Icon = config.icon;
  return (
    <div
      className="flex items-center justify-center size-5 rounded bg-muted/60 text-muted-foreground/70"
      title={config.label}
    >
      <Icon className="size-3" />
    </div>
  );
}

function ProviderIcon({ provider }: { provider: string }) {
  return (
    <div
      className={cn(
        "size-5 rounded-md flex items-center justify-center text-[9px] font-bold text-white shrink-0",
        getProviderColor(provider),
      )}
    >
      {provider.charAt(0)}
    </div>
  );
}

function ModelRow({
  model,
  isFavorite,
  isFavoritePending,
  isSelected,
  onSelect,
  onToggleFavorite,
}: {
  model: Model;
  isFavorite: boolean;
  isFavoritePending: boolean;
  isSelected: boolean;
  onSelect: (model: Model) => void;
  onToggleFavorite: (modelId: string) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors group/row",
        isSelected
          ? "bg-primary/10 text-foreground"
          : "text-foreground hover:bg-accent/50",
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(model)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <ProviderIcon provider={model.provider} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{model.name}</span>
            <PricingBadge pricing={model.pricing} />
            {model.badge && (
              <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none tracking-wider text-primary">
                {model.badge}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {model.description}
          </p>
        </div>
      </button>

      <div className="flex shrink-0 items-center gap-1">
        {model.capabilities.map((capability) => (
          <CapabilityIcon key={capability} capability={capability} />
        ))}
      </div>

      <div className="ml-1 flex shrink-0 items-center gap-1">
        <button
          type="button"
          className={cn(
            "rounded-md p-1 transition-colors",
            isFavorite
              ? "text-amber-500 hover:text-amber-400"
              : "text-muted-foreground/45 hover:text-amber-500",
            isFavoritePending && "cursor-wait opacity-60",
          )}
          onClick={() => onToggleFavorite(model.id)}
          disabled={isFavoritePending}
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Star
            className={cn(
              "size-3.5 transition-transform",
              isFavorite && "fill-current",
            )}
          />
        </button>
        <button
          type="button"
          className="rounded-md p-1 text-muted-foreground/50 opacity-0 transition-opacity hover:text-muted-foreground group-hover/row:opacity-100"
          title="Model details"
        >
          <Info className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function ProviderSidebar({
  selectedFilter,
  onSelectFilter,
}: {
  selectedFilter: ModelFilter;
  onSelectFilter: (filter: ModelFilter) => void;
}) {
  return (
    <div className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-border/50 px-1.5 py-2">
      <button
        type="button"
        onClick={() => onSelectFilter("favorites")}
        className={cn(
          "flex h-12 w-full flex-col items-center justify-center rounded-lg transition-colors",
          selectedFilter === "favorites"
            ? "bg-accent text-foreground"
            : "text-muted-foreground/60 hover:bg-accent/50 hover:text-muted-foreground",
        )}
        title="Favorites"
      >
        <Star
          className={cn(
            "size-4",
            selectedFilter === "favorites" && "fill-amber-400 text-amber-400",
          )}
        />
        <span className="mt-1 text-[8px] font-medium uppercase tracking-[0.18em]">
          Fav
        </span>
      </button>

      {PROVIDERS.map((provider) => (
        <button
          key={provider.id}
          type="button"
          onClick={() => onSelectFilter(provider.id)}
          className={cn(
            "flex size-9 items-center justify-center rounded-lg transition-colors",
            selectedFilter === provider.id
              ? "bg-accent text-foreground"
              : "text-muted-foreground/60 hover:bg-accent/50 hover:text-muted-foreground",
          )}
          title={provider.name}
        >
          <div
            className={cn(
              "flex size-5 items-center justify-center rounded-md text-[9px] font-bold text-white",
              getProviderColor(provider.id),
            )}
          >
            {provider.id.charAt(0)}
          </div>
        </button>
      ))}
    </div>
  );
}

export default function ModelSelector({
  model,
  onModelChange,
}: {
  model: Model;
  onModelChange: (model: Model) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<ModelFilter>("all");
  const [optimisticFavoriteIds, setOptimisticFavoriteIds] = useState<string[] | null>(
    null,
  );
  const [pendingFavoriteIds, setPendingFavoriteIds] = useState<string[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const deferredSearch = useDeferredValue(search);

  const favoriteModelIds = useQuery(api.favoriteModels.list, {});
  const toggleFavorite = useMutation(api.favoriteModels.toggle);

  useEffect(() => {
    if (favoriteModelIds !== undefined) {
      setOptimisticFavoriteIds(favoriteModelIds);
    }
  }, [favoriteModelIds]);

  useEffect(() => {
    if (open) {
      setSearch("");
      setSelectedFilter("all");
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const activeFavoriteIds = optimisticFavoriteIds ?? favoriteModelIds ?? [];
  const favoriteIdSet = useMemo(
    () => new Set(activeFavoriteIds),
    [activeFavoriteIds],
  );

  const rankedModels = useMemo(() => {
    return MODELS.map((entry, index) => ({
      index,
      model: entry,
      isFavorite: favoriteIdSet.has(entry.id),
    })).sort((left, right) => {
      if (left.isFavorite === right.isFavorite) {
        return left.index - right.index;
      }

      return left.isFavorite ? -1 : 1;
    });
  }, [favoriteIdSet]);

  const filteredModels = useMemo(() => {
    let models = rankedModels;

    if (selectedFilter === "favorites") {
      models = models.filter((entry) => entry.isFavorite);
    } else if (selectedFilter !== "all") {
      models = models.filter((entry) => entry.model.provider === selectedFilter);
    }

    if (deferredSearch.trim()) {
      const query = deferredSearch.toLowerCase();
      models = models.filter(
        ({ model: entry }) =>
          entry.name.toLowerCase().includes(query) ||
          entry.provider.toLowerCase().includes(query) ||
          entry.description.toLowerCase().includes(query),
      );
    }

    return models;
  }, [deferredSearch, rankedModels, selectedFilter]);

  const handleSelect = useCallback(
    (selected: Model) => {
      onModelChange(selected);
      setOpen(false);
    },
    [onModelChange],
  );

  const handleToggleFavorite = useCallback(
    async (modelId: string) => {
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
    },
    [favoriteModelIds, optimisticFavoriteIds, pendingFavoriteIds, toggleFavorite],
  );

  const emptyStateMessage =
    selectedFilter === "favorites" && activeFavoriteIds.length === 0
      ? "No favorites yet. Star a model to pin it here."
      : "No models found";

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        render={
          <button className="group flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
            <div
              className={cn(
                "size-2 rounded-full transition-colors",
                getProviderColor(model.provider),
              )}
            />
            <span className="font-medium">{model.name}</span>
            <ChevronDown
              className={cn(
                "size-3 opacity-50 transition-transform",
                open && "rotate-180",
              )}
            />
          </button>
        }
      />
      <Popover.Portal>
        <Popover.Positioner
          side="top"
          align="start"
          sideOffset={8}
          className="z-50 outline-none"
        >
          <Popover.Popup className="w-[520px] overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-xl ring-1 ring-foreground/10 origin-(--transform-origin) data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2.5">
              <div className="flex flex-1 items-center gap-2 rounded-lg bg-muted/35 px-2.5 py-2">
                <Search className="size-4 shrink-0 text-muted-foreground/50" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search models..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground/40 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => setSelectedFilter("all")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] font-medium transition-colors",
                  selectedFilter === "all"
                    ? "border-primary/25 bg-primary/10 text-foreground"
                    : "border-border/60 text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
                title="Show all models"
              >
                <LayoutGrid className="size-3.5" />
                <span>All models</span>
              </button>
            </div>

            <div className="flex max-h-80">
              <ProviderSidebar
                selectedFilter={selectedFilter}
                onSelectFilter={setSelectedFilter}
              />
              <div className="thin-scrollbar flex-1 overflow-y-auto px-1 py-1">
                {filteredModels.length === 0 ? (
                  <div className="flex items-center justify-center px-6 py-10 text-center text-sm text-muted-foreground/60">
                    {emptyStateMessage}
                  </div>
                ) : (
                  filteredModels.map(({ model: entry, isFavorite }) => (
                    <ModelRow
                      key={entry.id}
                      model={entry}
                      isFavorite={isFavorite}
                      isFavoritePending={pendingFavoriteIds.includes(entry.id)}
                      isSelected={entry.id === model.id}
                      onSelect={handleSelect}
                      onToggleFavorite={handleToggleFavorite}
                    />
                  ))
                )}
              </div>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
