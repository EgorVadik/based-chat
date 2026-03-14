import { Button } from "@based-chat/ui/components/button";
import { Textarea } from "@based-chat/ui/components/textarea";
import { cn } from "@based-chat/ui/lib/utils";
import { ArrowUp, Paperclip } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Model } from "@/lib/models";
import ModelSelector from "./model-selector";

const MIN_TEXTAREA_HEIGHT = 96;
const MAX_TEXTAREA_HEIGHT = 240;

export default function ChatInput({
  model,
  onModelChange,
  onSend,
  value,
  onValueChange,
  disabled = false,
  className,
}: {
  model: Model;
  onModelChange: (model: Model) => void;
  onSend?: (message: string) => void | Promise<void>;
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [internalValue, setInternalValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const currentValue = value ?? internalValue;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = `${MIN_TEXTAREA_HEIGHT}px`;
    const nextHeight = Math.min(
      Math.max(textarea.scrollHeight, MIN_TEXTAREA_HEIGHT),
      MAX_TEXTAREA_HEIGHT,
    );
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > MAX_TEXTAREA_HEIGHT ? "auto" : "hidden";
  }, [currentValue]);

  const setValue = useCallback(
    (nextValue: string) => {
      if (onValueChange) {
        onValueChange(nextValue);
        return;
      }

      setInternalValue(nextValue);
    },
    [onValueChange],
  );

  const handleSend = useCallback(async () => {
    if (disabled || isSubmitting || !currentValue.trim()) return;

    setIsSubmitting(true);

    try {
      await onSend?.(currentValue.trim());
      setValue("");
      if (textareaRef.current) {
        textareaRef.current.style.height = `${MIN_TEXTAREA_HEIGHT}px`;
        textareaRef.current.style.overflowY = "hidden";
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [currentValue, disabled, isSubmitting, onSend, setValue]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = `${MIN_TEXTAREA_HEIGHT}px`;
    const nextHeight = Math.min(
      Math.max(textarea.scrollHeight, MIN_TEXTAREA_HEIGHT),
      MAX_TEXTAREA_HEIGHT,
    );
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > MAX_TEXTAREA_HEIGHT ? "auto" : "hidden";
  }, []);

  return (
    <div className={cn("w-full shrink-0", className)}>
      <div className="mx-auto max-w-3xl px-4 pb-4">
        <div className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm transition-colors focus-within:border-primary/30 focus-within:bg-card">
          <div className="px-4 pt-3.5">
            <Textarea
              ref={textareaRef}
              value={currentValue}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              disabled={disabled || isSubmitting}
              placeholder="Send a message..."
              rows={1}
              className="block min-h-[96px] w-full resize-none overflow-y-hidden border-0 bg-transparent px-0 py-0 pb-3 text-sm leading-relaxed shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
          </div>
          <div className="flex items-center justify-between border-t border-border/40 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground"
              >
                <Paperclip className="size-4" />
              </Button>
              <ModelSelector model={model} onModelChange={onModelChange} />
            </div>
            <Button
              size="icon-sm"
              onClick={() => void handleSend()}
              disabled={disabled || isSubmitting || !currentValue.trim()}
              className={cn(
                "transition-all",
                !disabled && !isSubmitting && currentValue.trim()
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
