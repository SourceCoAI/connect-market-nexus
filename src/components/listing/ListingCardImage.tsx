import { memo } from "react";
import { ImageIcon } from "lucide-react";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { useState, useEffect } from "react";
import { DEFAULT_IMAGE } from "@/lib/storage-utils";

interface ListingCardImageProps {
  imageUrl: string | null;
  title: string;
  viewType: "grid" | "list";
}

const ListingCardImage = memo(function ListingCardImage({ imageUrl: initialImageUrl, title, viewType }: ListingCardImageProps) {
  const [imageError, setImageError] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  
  // Initialize image URL and validate it
  useEffect(() => {
    // Use the listing's image_url or fall back to default
    const url = initialImageUrl || DEFAULT_IMAGE;
    setImageUrl(url);
    
    // Reset error state when listing changes
    setImageError(false);
  }, [initialImageUrl]);

  const handleImageError = () => {
    console.error(`Failed to load image:`, imageUrl);
    setImageError(true);
    // Switch to default image when the original fails
    if (imageUrl !== DEFAULT_IMAGE) {
      setImageUrl(DEFAULT_IMAGE);
    }
  };

  return (
    <div className={viewType === "list" ? "w-full sm:w-1/4 sm:min-w-[200px]" : ""}>
      <AspectRatio ratio={viewType === "list" ? 3/4 : 16/9} className="bg-muted/30 relative overflow-hidden rounded-lg">
        {imageError || !imageUrl ? (
          <div className="w-full h-full flex items-center justify-center bg-muted/50">
            <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
          </div>
        ) : (
          <img
            src={imageUrl}
            alt={title}
            loading="lazy"
            decoding="async"
            className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-105"
            onError={handleImageError}
          />
        )}
      </AspectRatio>
    </div>
  );
});

export default ListingCardImage;