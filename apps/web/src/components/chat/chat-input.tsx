import { Button } from "@based-chat/ui/components/button";
import { cn } from "@based-chat/ui/lib/utils";
import { ArrowUp, Paperclip, ChevronDown } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import type { Model } from "@/lib/fake-data";

function ModelBadge({ model }: { model: Model }) {
  return (
    <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group">
      <div className="size-2 rounded-full bg-primary/60 group-hover:bg-primary transition-colors" />
      <span className="font-medium">{model.name}</span>
      <ChevronDown className="size-3 opacity-50" />
    </button>
  );
}

export default function ChatInput({
  model,
  onSend,
  className,
}: {
  model: Model;
  onSend?: (message: string) => void;
  className?: string;
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    if (!value.trim()) return;
    onSend?.(value.trim());
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, []);

  return (
    <div className={cn("w-full", className)}>
      <div className="mx-auto max-w-3xl px-4 pb-4">
        <div className="relative rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm transition-colors focus-within:border-primary/30 focus-within:bg-card">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder="Send a message..."
            rows={1}
            className="w-full resize-none bg-transparent px-4 pt-3.5 pb-12 text-sm leading-relaxed placeholder:text-muted-foreground/50 focus:outline-none"
          />
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 pb-2.5">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground"
              >
                <Paperclip className="size-4" />
              </Button>
              <ModelBadge model={model} />
            </div>
            <Button
              size="icon-sm"
              onClick={handleSend}
              disabled={!value.trim()}
              className={cn(
                "transition-all",
                value.trim()
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <ArrowUp className="size-4" />
            </Button>
          </div>
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground/50">
          Based Chat may produce inaccurate information. Verify important details.
        </p>
      </div>
    </div>
  );
}
