import { Button } from "@based-chat/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@based-chat/ui/components/dialog";
import { cn } from "@based-chat/ui/lib/utils";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

type PreviewImage = {
  id: string;
  src: string;
  alt: string;
  caption?: string;
};

export default function ChatImageDialog({
  images,
  selectedImageId,
  onSelectImage,
  onClose,
}: {
  images: PreviewImage[];
  selectedImageId: string | null;
  onSelectImage: (imageId: string) => void;
  onClose: () => void;
}) {
  const selectedIndex = images.findIndex((image) => image.id === selectedImageId);
  const isOpen = selectedIndex >= 0;
  const selectedImage = selectedIndex >= 0 ? images[selectedIndex] : null;
  const hasMultipleImages = images.length > 1;

  const handleStep = (direction: -1 | 1) => {
    if (!selectedImage || images.length === 0) {
      return;
    }

    const nextIndex = (selectedIndex + direction + images.length) % images.length;
    onSelectImage(images[nextIndex]!.id);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      {selectedImage ? (
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[calc(100vh-2rem)] w-[min(calc(100vw-2rem),72rem)] flex-col gap-0 overflow-hidden rounded-[28px] border border-white/10 bg-black/70 p-0 text-white shadow-2xl shadow-black/50"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-white">
            <div className="min-w-0">
              <DialogTitle className="truncate text-sm font-medium text-white">
                {selectedImage.alt}
              </DialogTitle>
              {selectedImage.caption ? (
                <DialogDescription className="mt-0.5 truncate text-xs text-white/60">
                  {selectedImage.caption}
                </DialogDescription>
              ) : null}
            </div>
            <DialogClose
              render={
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="rounded-full text-white/70 hover:bg-white/10 hover:text-white"
                />
              }
            >
              <X className="size-4" />
              <span className="sr-only">Close image preview</span>
            </DialogClose>
          </div>

          <div className="relative flex min-h-[50vh] items-center justify-center bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_45%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0))] px-4 py-6">
            {hasMultipleImages ? (
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                onClick={() => handleStep(-1)}
                className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full border-white/15 bg-black/40 text-white hover:bg-black/60"
              >
                <ChevronLeft className="size-4" />
              </Button>
            ) : null}

            <img
              src={selectedImage.src}
              alt={selectedImage.alt}
              className="max-h-[70vh] w-auto max-w-full rounded-2xl object-contain shadow-[0_30px_80px_rgba(0,0,0,0.45)]"
            />

            {hasMultipleImages ? (
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                onClick={() => handleStep(1)}
                className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full border-white/15 bg-black/40 text-white hover:bg-black/60"
              >
                <ChevronRight className="size-4" />
              </Button>
            ) : null}
          </div>

          {hasMultipleImages ? (
            <div className="flex gap-2 overflow-x-auto border-t border-white/10 px-4 py-3">
              {images.map((image) => (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => onSelectImage(image.id)}
                  className={cn(
                    "relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border transition-all",
                    image.id === selectedImage.id
                      ? "border-white/80 shadow-[0_0_0_1px_rgba(255,255,255,0.3)]"
                      : "border-white/10 opacity-70 hover:opacity-100",
                  )}
                >
                  <img
                    src={image.src}
                    alt={image.alt}
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          ) : null}
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
