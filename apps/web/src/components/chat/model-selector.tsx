import { api } from "@based-chat/backend/convex/_generated/api";
import { Button } from "@based-chat/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@based-chat/ui/components/tooltip";
import { cn } from "@based-chat/ui/lib/utils";
import { Popover } from "@base-ui/react/popover";
import { useMutation, useQuery } from "convex/react";
import {
  Brain,
  ChevronDown,
  Eye,
  FileText,
  ImagePlus,
  Info,
  Search,
  Star,
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

import { useTheme } from "@/components/theme-provider";
import { useLocalStorage } from "@/hooks/use-local-storage";
import {
  formatModelPricing,
  getProviderIconUrl,
  modelSupportsAttachments,
  useModelCatalog,
  type Model,
  type ModelCapability,
} from "@/lib/models";
import type { ComposerAttachment, DraftAttachment } from "@/lib/attachments";

type ModelFilter = "favorites" | string;

const MODEL_SELECTOR_FILTER_STORAGE_KEY = "based-chat:model-selector-filter";

const CAPABILITY_CONFIG: Record<
  ModelCapability,
  { icon: typeof Eye; label: string }
> = {
  image: { icon: Eye, label: "Supports image uploads" },
  reasoning: { icon: Brain, label: "Reasoning" },
  pdf: { icon: FileText, label: "Understands PDFs" },
  "image-gen": { icon: ImagePlus, label: "Image generation" },
};

function CapabilityIcon({ capability }: { capability: ModelCapability }) {
  const config = CAPABILITY_CONFIG[capability];
  const Icon = config.icon;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div className="flex items-center justify-center size-5 rounded bg-muted/60 text-muted-foreground/70">
            <Icon className="size-3" />
          </div>
        }
      />
      <TooltipContent side="top" align="center">
        {config.label}
      </TooltipContent>
    </Tooltip>
  );
}

function ModelInfoTooltip({ model }: { model: Model }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div className="flex items-center justify-center size-6 rounded-md text-muted-foreground/40 transition-colors hover:text-muted-foreground">
            <Info className="size-3.5" />
          </div>
        }
      />
      <TooltipContent
        side="top"
        align="center"
        className="max-w-72 flex-col items-start gap-0 rounded-lg bg-zinc-900 px-3.5 py-3 text-zinc-100 shadow-xl ring-1 ring-white/8 *:last:bg-zinc-900"
      >
        <div className="flex w-full flex-col gap-2.5 text-left">
          <div>
            <div className="text-[13px] font-semibold text-zinc-50">{model.name}</div>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
              {model.description}
            </p>
          </div>

          <div className="h-px w-full bg-zinc-700/50" />

          <div className="flex items-start gap-6">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                Provider
              </div>
              <div className="mt-0.5 text-[11px] font-medium text-zinc-200">OpenRouter</div>
            </div>
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                Developer
              </div>
              <div className="mt-0.5 text-[11px] font-medium text-zinc-200">{model.provider}</div>
            </div>
          </div>

          <div className="h-px w-full bg-zinc-700/50" />

          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Pricing
            </div>
            <div className="mt-0.5 font-mono text-[11px] tabular-nums text-zinc-300">
              {formatModelPricing(model.pricing)}
            </div>
          </div>

          {model.capabilities.length > 0 && (
            <>
              <div className="h-px w-full bg-zinc-700/50" />
              <div className="flex flex-wrap gap-1.5">
                {model.capabilities.map((cap) => {
                  const capConfig = CAPABILITY_CONFIG[cap];
                  const CapIcon = capConfig.icon;
                  return (
                    <span
                      key={cap}
                      className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-300"
                    >
                      <CapIcon className="size-2.5" />
                      {capConfig.label}
                    </span>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function ProviderLogo({
  provider,
  className,
}: {
  provider: string;
  className?: string;
}) {
  const { resolvedTheme } = useTheme();
  const iconUrl = getProviderIconUrl(
    provider,
    (resolvedTheme as "light" | "dark") ?? "dark",
  );

  if (!iconUrl) {
    return <div className={cn("size-5 shrink-0", className)} aria-hidden="true" />;
  }

  return (
    <img
      src={iconUrl}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn(
        "size-5 shrink-0 select-none object-contain",
        className,
      )}
    />
  );
}

function ProviderIcon({ provider }: { provider: string }) {
  return (
    <div className="flex size-5 shrink-0 items-center justify-center text-muted-foreground/90">
      <ProviderLogo provider={provider} />
    </div>
  );
}

function ModelRow({
  model,
  isFavorite,
  isUnfavoriteArmed,
  isFavoritePending,
  isSelected,
  isDisabled,
  onSelect,
  onToggleFavorite,
}: {
  model: Model;
  isFavorite: boolean;
  isUnfavoriteArmed: boolean;
  isFavoritePending: boolean;
  isSelected: boolean;
  isDisabled: boolean;
  onSelect: (model: Model) => void;
  onToggleFavorite: (modelId: string, isFavorite: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[20px_1fr_auto] items-center gap-x-2 rounded-xl px-2 py-2.5 transition-colors sm:grid-cols-[20px_1fr_auto_auto_auto] sm:gap-x-2.5 sm:px-3",
        isSelected
          ? "bg-primary/10 text-foreground"
          : "text-foreground hover:bg-accent/50",
        isDisabled && "opacity-45 hover:bg-transparent",
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(model)}
        disabled={isDisabled}
        className="col-span-2 grid grid-cols-subgrid items-center gap-x-2 text-left sm:gap-x-2.5 disabled:cursor-not-allowed"
      >
        <ProviderIcon provider={model.provider} />
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-semibold leading-5">
              {model.name}
            </span>
            {model.badge ? (
              <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none tracking-wider text-primary">
                {model.badge}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {model.description}
          </p>
        </div>
      </button>

      <div className="hidden shrink-0 items-center gap-1 sm:flex">
        {model.capabilities.map((capability) => (
          <CapabilityIcon key={capability} capability={capability} />
        ))}
      </div>

      <div className="hidden sm:block">
        <ModelInfoTooltip model={model} />
      </div>

      <div className="flex shrink-0 items-center justify-end">
        <Tooltip open={isFavorite && isUnfavoriteArmed}>
          <TooltipTrigger
            render={
              <button
                type="button"
                className={cn(
                  "cursor-pointer rounded-md p-1.5 transition-colors",
                  isFavorite
                    ? "text-amber-500 hover:text-amber-400"
                    : "text-muted-foreground/45 hover:text-amber-500",
                  isFavoritePending && "cursor-wait opacity-60",
                )}
                onClick={() => onToggleFavorite(model.id, isFavorite)}
                disabled={isFavoritePending}
                aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
              />
            }
          >
            <Star
              className={cn(
                "size-3.5 transition-transform",
                isFavorite && "fill-current",
              )}
            />
          </TooltipTrigger>
          <TooltipContent side="left" align="center">
            Click again to unfavorite
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function ProviderSidebar({
  providers,
  selectedFilter,
  onSelectFilter,
}: {
  providers: Array<{ id: string; name: string }>;
  selectedFilter: ModelFilter;
  onSelectFilter: (filter: ModelFilter) => void;
}) {
  return (
    <div className="max-h-80 w-14 shrink-0 overflow-y-auto border-r border-border/50 px-1.5 py-2 sm:w-[72px] sm:px-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex min-h-full flex-col items-center gap-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                onClick={() => onSelectFilter("favorites")}
                variant="ghost"
                size="icon"
                className={cn(
                  "relative size-10 rounded-xl sm:size-12",
                  selectedFilter === "favorites"
                    ? "bg-accent/70 text-foreground after:absolute after:right-[-7px] after:h-7 after:w-0.5 after:rounded-full after:bg-primary sm:after:right-[-9px]"
                    : "text-muted-foreground/55 hover:bg-accent/40 hover:text-muted-foreground",
                )}
              />
            }
          >
            <Star
              className={cn(
                "size-4.5",
                selectedFilter === "favorites" && "fill-amber-400 text-amber-400",
              )}
            />
          </TooltipTrigger>
          <TooltipContent side="left" align="center">
            Favorites
          </TooltipContent>
        </Tooltip>

        {providers.map((provider) => (
          <Tooltip key={provider.id}>
            <TooltipTrigger
              render={
                <Button
                  onClick={() => onSelectFilter(provider.id)}
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "relative size-10 rounded-xl sm:size-12",
                    selectedFilter === provider.id
                      ? "bg-accent/70 text-foreground after:absolute after:right-[-7px] after:h-7 after:w-0.5 after:rounded-full after:bg-primary sm:after:right-[-9px]"
                      : "text-muted-foreground/55 hover:bg-accent/40 hover:text-muted-foreground",
                  )}
                />
              }
            >
              <ProviderLogo provider={provider.id} className="size-[18px]" />
            </TooltipTrigger>
            <TooltipContent side="left" align="center">
              {provider.name}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

export default function ModelSelector({
  model,
  onModelChange,
  pendingAttachments = [],
}: {
  model: Model;
  onModelChange: (model: Model) => void;
  pendingAttachments?: Array<DraftAttachment | ComposerAttachment>;
}) {
  const { models, providers } = useModelCatalog();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedFilter, setSelectedFilter] = useLocalStorage<ModelFilter>(
    MODEL_SELECTOR_FILTER_STORAGE_KEY,
    "favorites",
    {
      parse: (storedFilter) => {
        if (
          storedFilter === "favorites" ||
          providers.some((provider) => provider.id === storedFilter)
        ) {
          return storedFilter as ModelFilter;
        }

        return "favorites";
      },
      serialize: (filter) => filter,
    },
  );
  const [showLegacyModels, setShowLegacyModels] = useState(false);
  const [armedUnfavoriteModelId, setArmedUnfavoriteModelId] = useState<string | null>(
    null,
  );
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
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (!armedUnfavoriteModelId) {
      return;
    }

    const timer = window.setTimeout(() => {
      setArmedUnfavoriteModelId(null);
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [armedUnfavoriteModelId]);

  useEffect(() => {
    if (
      selectedFilter !== "favorites" &&
      !providers.some((provider) => provider.id === selectedFilter)
    ) {
      setSelectedFilter("favorites");
    }
  }, [providers, selectedFilter, setSelectedFilter]);

  const activeFavoriteIds = optimisticFavoriteIds ?? favoriteModelIds ?? [];
  const favoriteIdSet = useMemo(
    () => new Set(activeFavoriteIds),
    [activeFavoriteIds],
  );

  const rankedModels = useMemo(() => {
    return models.map((entry, index) => ({
      index,
      model: entry,
      isFavorite: favoriteIdSet.has(entry.id),
    })).sort((left, right) => {
      if (left.isFavorite === right.isFavorite) {
        return left.index - right.index;
      }

      return left.isFavorite ? -1 : 1;
    });
  }, [favoriteIdSet, models]);

  const hasSearch = deferredSearch.trim().length > 0;

  const filteredModels = useMemo(() => {
    let models = rankedModels;

    if (!hasSearch) {
      if (selectedFilter === "favorites") {
        models = models.filter((entry) => entry.isFavorite);
      } else {
        models = models.filter((entry) => entry.model.provider === selectedFilter);
      }
    }

    if (hasSearch) {
      const query = deferredSearch.toLowerCase();
      models = models.filter(
        ({ model: entry }) =>
          entry.name.toLowerCase().includes(query) ||
          entry.provider.toLowerCase().includes(query) ||
          entry.description.toLowerCase().includes(query),
      );
    }

    return models;
  }, [deferredSearch, hasSearch, rankedModels, selectedFilter]);

  const isProviderView = selectedFilter !== "favorites" && !hasSearch;

  const primaryModels = useMemo(() => {
    if (!isProviderView) {
      return filteredModels;
    }

    return filteredModels.filter(({ model: entry }) => !entry.isLegacy);
  }, [filteredModels, isProviderView]);

  const legacyModels = useMemo(() => {
    if (!isProviderView) {
      return [];
    }

    return filteredModels.filter(({ model: entry }) => entry.isLegacy);
  }, [filteredModels, isProviderView]);

  const shouldShowLegacySection = isProviderView && legacyModels.length > 0;
  const legacySectionOpen = shouldShowLegacySection && (showLegacyModels || hasSearch);

  const visibleModels = primaryModels;

  const handleSelectFilter = useCallback((filter: ModelFilter) => {
    setSelectedFilter(filter);
    setShowLegacyModels(false);
  }, []);

  const handleSelect = useCallback(
    (selected: Model) => {
      onModelChange(selected);
      setOpen(false);
    },
    [onModelChange],
  );

  const handleToggleFavorite = useCallback(
    async (modelId: string, isFavorite: boolean) => {
      if (pendingFavoriteIds.includes(modelId)) {
        return;
      }

      if (isFavorite && armedUnfavoriteModelId !== modelId) {
        setArmedUnfavoriteModelId(modelId);
        return;
      }

      setArmedUnfavoriteModelId(null);

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
    [
      armedUnfavoriteModelId,
      favoriteModelIds,
      optimisticFavoriteIds,
      pendingFavoriteIds,
      toggleFavorite,
    ],
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
            <ProviderLogo provider={model.provider} className="size-3.5" />
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
          <Popover.Popup className="w-[520px] max-w-[calc(100vw-16px)] overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-xl ring-1 ring-foreground/10 origin-(--transform-origin) data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
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
            </div>

            <div className="flex max-h-80">
              <ProviderSidebar
                providers={providers}
                selectedFilter={selectedFilter}
                onSelectFilter={handleSelectFilter}
              />
              <div className="thin-scrollbar flex-1 overflow-y-auto px-1 py-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {visibleModels.length === 0 && !legacyModels.length ? (
                  <div className="flex items-center justify-center px-6 py-10 text-center text-sm text-muted-foreground/60">
                    {emptyStateMessage}
                  </div>
                ) : (
                  <>
                    {visibleModels.map(({ model: entry, isFavorite }) => (
                      <ModelRow
                        key={entry.id}
                        model={entry}
                        isFavorite={isFavorite}
                        isUnfavoriteArmed={armedUnfavoriteModelId === entry.id}
                        isFavoritePending={pendingFavoriteIds.includes(entry.id)}
                        isSelected={entry.id === model.id}
                        isDisabled={
                          pendingAttachments.length > 0 &&
                          !modelSupportsAttachments(entry, pendingAttachments)
                        }
                        onSelect={handleSelect}
                        onToggleFavorite={handleToggleFavorite}
                      />
                    ))}

                    {shouldShowLegacySection ? (
                      <div className="px-2 pb-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setShowLegacyModels((current) => !current)}
                          className="flex w-full items-center justify-between rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                        >
                          <span>
                            {legacyModels.length} legacy model
                            {legacyModels.length === 1 ? "" : "s"}
                          </span>
                          <ChevronDown
                            className={cn(
                              "size-3.5 transition-transform",
                              legacySectionOpen && "rotate-180",
                            )}
                          />
                        </button>
                      </div>
                    ) : null}

                    {legacySectionOpen
                      ? legacyModels.map(({ model: entry, isFavorite }) => (
                          <ModelRow
                            key={entry.id}
                            model={entry}
                            isFavorite={isFavorite}
                            isUnfavoriteArmed={armedUnfavoriteModelId === entry.id}
                            isFavoritePending={pendingFavoriteIds.includes(entry.id)}
                            isSelected={entry.id === model.id}
                            isDisabled={
                              pendingAttachments.length > 0 &&
                              !modelSupportsAttachments(entry, pendingAttachments)
                            }
                            onSelect={handleSelect}
                            onToggleFavorite={handleToggleFavorite}
                          />
                        ))
                      : null}
                  </>
                )}
              </div>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
