import { cn } from "@based-chat/ui/lib/utils";
import { Popover } from "@base-ui/react/popover";
import {
  ChevronDown,
  Search,
  Eye,
  Wrench,
  Brain,
  ImagePlus,
  Star,
  Info,
} from "lucide-react";
import { useCallback, useMemo, useState, useRef, useEffect } from "react";
import {
  MODELS,
  PROVIDERS,
  type Model,
  type ModelCapability,
} from "@/lib/fake-data";

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

function getProviderTextColor(provider: string) {
  switch (provider) {
    case "Anthropic":
      return "text-[oklch(0.72_0.17_195)]";
    case "OpenAI":
      return "text-[oklch(0.72_0.15_145)]";
    case "Google":
      return "text-[oklch(0.72_0.16_60)]";
    case "Meta":
      return "text-[oklch(0.65_0.15_250)]";
    case "DeepSeek":
      return "text-[oklch(0.65_0.18_270)]";
    default:
      return "text-muted-foreground";
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
  isSelected,
  onSelect,
}: {
  model: Model;
  isSelected: boolean;
  onSelect: (model: Model) => void;
}) {
  return (
    <button
      onClick={() => onSelect(model)}
      className={cn(
        "flex items-center gap-3 w-full px-3 py-2.5 text-left transition-colors rounded-lg group/row",
        isSelected
          ? "bg-primary/10 text-foreground"
          : "hover:bg-accent/50 text-foreground",
      )}
    >
      <ProviderIcon provider={model.provider} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold truncate">{model.name}</span>
          <PricingBadge pricing={model.pricing} />
          {model.isFavorite && (
            <Star className="size-3.5 fill-amber-400 text-amber-400" />
          )}
          {model.badge && (
            <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary leading-none">
              {model.badge}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {model.description}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {model.capabilities.map((cap) => (
          <CapabilityIcon key={cap} capability={cap} />
        ))}
      </div>
      <button
        className="opacity-0 group-hover/row:opacity-100 transition-opacity text-muted-foreground/50 hover:text-muted-foreground ml-1"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <Info className="size-3.5" />
      </button>
    </button>
  );
}

function ProviderSidebar({
  selectedProvider,
  onSelectProvider,
}: {
  selectedProvider: string;
  onSelectProvider: (provider: string) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1 py-2 px-1.5 border-r border-border/50 w-14 shrink-0">
      {PROVIDERS.map((provider) => (
        <button
          key={provider.id}
          onClick={() => onSelectProvider(provider.id)}
          className={cn(
            "flex items-center justify-center size-9 rounded-lg transition-colors relative",
            selectedProvider === provider.id
              ? "bg-accent text-foreground"
              : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent/50",
          )}
          title={provider.name}
        >
          {provider.id === "all" ? (
            <Star className="size-4" />
          ) : (
            <div
              className={cn(
                "size-5 rounded-md flex items-center justify-center text-[9px] font-bold text-white",
                getProviderColor(provider.id),
              )}
            >
              {provider.id.charAt(0)}
            </div>
          )}
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
  const [selectedProvider, setSelectedProvider] = useState("all");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSearch("");
      setSelectedProvider("all");
      // Focus search input after popover animation
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const filteredModels = useMemo(() => {
    let models = MODELS;

    if (selectedProvider !== "all") {
      models = models.filter((m) => m.provider === selectedProvider);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      models = models.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.provider.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q),
      );
    }

    return models;
  }, [search, selectedProvider]);

  const handleSelect = useCallback(
    (selected: Model) => {
      onModelChange(selected);
      setOpen(false);
    },
    [onModelChange],
  );

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        render={
          <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group">
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
          <Popover.Popup className="w-[480px] rounded-xl bg-popover text-popover-foreground shadow-xl ring-1 ring-foreground/10 origin-(--transform-origin) data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 overflow-hidden">
            {/* Search header */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/50">
              <Search className="size-4 text-muted-foreground/50 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search models..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground/40 focus:outline-none"
              />
            </div>

            {/* Body: sidebar + model list */}
            <div className="flex max-h-80">
              <ProviderSidebar
                selectedProvider={selectedProvider}
                onSelectProvider={setSelectedProvider}
              />
              <div className="flex-1 overflow-y-auto thin-scrollbar py-1 px-1">
                {filteredModels.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-sm text-muted-foreground/60">
                    No models found
                  </div>
                ) : (
                  filteredModels.map((m) => (
                    <ModelRow
                      key={m.id}
                      model={m}
                      isSelected={m.id === model.id}
                      onSelect={handleSelect}
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
