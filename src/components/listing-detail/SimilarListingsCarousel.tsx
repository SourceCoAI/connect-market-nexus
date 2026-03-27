import { useSimilarListings } from '@/hooks/use-similar-listings';
import { Listing } from '@/types';
import { Link } from 'react-router-dom';
import { formatCurrency } from '@/lib/currency-utils';
import { getListingImage } from '@/lib/listing-image-utils';
import { stateToRegion } from '@/lib/deal-to-listing-anonymizer';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';

interface SimilarListingsCarouselProps {
  currentListing: Listing;
}

export function SimilarListingsCarousel({ currentListing }: SimilarListingsCarouselProps) {
  const { data: similarListings, isLoading } = useSimilarListings(currentListing);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">Similar listings</h2>
        <div className="flex gap-3 overflow-hidden">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="min-w-[320px] h-[320px] bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!similarListings || similarListings.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-foreground">Similar listings</h2>
      
      <Carousel
        opts={{
          align: "start",
          loop: false,
        }}
        className="w-full"
      >
        <CarouselContent className="-ml-3">
          {similarListings.map((listing) => {
            const image = getListingImage(listing.image_url ?? null, listing.category);
            const ebitdaMargin = listing.revenue > 0 
              ? ((Number(listing.ebitda) / Number(listing.revenue)) * 100).toFixed(1)
              : '0.0';
            const ebitdaMultiple = listing.ebitda > 0
              ? (Number(listing.revenue) / Number(listing.ebitda)).toFixed(1)
              : '0.0';

            return (
              <CarouselItem key={listing.id} className="pl-3 md:basis-1/2 lg:basis-1/3">
                <Link to={`/listing/${listing.id}`} className="block group">
                  <div className="bg-background border border-border rounded-lg overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
                    {/* Image Section */}
                    <div 
                      className="h-40 w-full"
                      style={{
                        background: image.type === 'gradient' ? image.value : 'transparent',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    >
                      {image.type === 'image' && (
                        <img 
                          src={image.value} 
                          alt={listing.title}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>

                    {/* Content Section */}
                    <div className="p-4 space-y-3">
                      {/* Title */}
                      <h3 className="text-lg font-semibold text-foreground leading-tight line-clamp-2 group-hover:text-foreground/80 transition-colors">
                        {listing.title}
                      </h3>

                      {/* Description Preview */}
                      {listing.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                          {listing.description.replace(/<[^>]*>/g, '').substring(0, 120)}...
                        </p>
                      )}

                      {/* Category & Location */}
                      <div className="flex items-center justify-between pt-2 border-t border-border text-xs text-muted-foreground">
                        <span className="px-2 py-1 bg-muted rounded">
                          {listing.category}
                        </span>
                        <span>{listing.location ? stateToRegion(listing.location) : listing.location}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              </CarouselItem>
            );
          })}
        </CarouselContent>
        <CarouselPrevious className="hidden md:flex -left-4" />
        <CarouselNext className="hidden md:flex -right-4" />
      </Carousel>
    </div>
  );
}
