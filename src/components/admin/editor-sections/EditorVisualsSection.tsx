import { Button } from "@/components/ui/button";
import { Image as ImageIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useRef } from "react";
import { EDITOR_DESIGN } from "@/lib/editor-design-system";
import { cn } from "@/lib/utils";

interface EditorVisualsSectionProps {
  imagePreview: string | null;
  imageError: string | null;
  onImageSelect: (file: File | null) => void;
  onRemoveImage: () => void;
}

export function EditorVisualsSection({
  imagePreview,
  imageError,
  onImageSelect,
  onRemoveImage,
}: EditorVisualsSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    onImageSelect(file);
  };

  return (
    <div className={cn(EDITOR_DESIGN.cardBg, EDITOR_DESIGN.cardBorder, "rounded-lg", EDITOR_DESIGN.cardPadding)}>
      <div className={cn(EDITOR_DESIGN.microHeader, "mb-4")}>
        Featured Image
      </div>

      {imagePreview ? (
        <div className="relative group">
          <div className={cn(EDITOR_DESIGN.wideImageAspect, "rounded-md overflow-hidden border border-border")}>
            <img
              src={imagePreview}
              alt="Preview"
              className="w-full h-full object-cover"
            />
          </div>
          <div className={cn(
            "absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 rounded-md flex items-center justify-center gap-2",
            EDITOR_DESIGN.transition
          )}>
            <Button
              type="button"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="h-8 px-3 text-sm bg-white text-black hover:bg-white/90"
            >
              Replace
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onRemoveImage}
              className="h-8 px-3 text-sm bg-red-500 text-white hover:bg-red-600"
            >
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            EDITOR_DESIGN.wideImageAspect,
            "rounded-md border-2 border-dashed border-border bg-muted/30 hover:bg-muted/50 cursor-pointer flex items-center justify-center",
            EDITOR_DESIGN.hoverTransition
          )}
        >
          <div className="text-center">
            <ImageIcon className="h-8 w-8 text-muted-foreground/60 mx-auto mb-2" />
            <p className="text-sm font-medium text-muted-foreground">Click to upload</p>
            <p className="text-xs text-muted-foreground mt-1">PNG, JPG, WebP up to 5MB</p>
          </div>
        </div>
      )}

      <Input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {imageError && (
        <p className="text-sm text-destructive mt-2">{imageError}</p>
      )}
    </div>
  );
}
