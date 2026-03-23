import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExternalLink, MapPin, DollarSign, Briefcase } from 'lucide-react';

interface ListingSummaryCardProps {
  listing: Record<string, any>;
  formatCurrency: (value: number | null) => string;
}

export function ListingSummaryCard({ listing, formatCurrency }: ListingSummaryCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          <span>{listing.title}</span>
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/admin/marketplace/listings/${listing.id}`}>
              <ExternalLink className="h-4 w-4 mr-1" />
              View Listing
            </Link>
          </Button>
        </CardTitle>
        <CardDescription>{listing.hero_description || 'No description'}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-muted-foreground">Revenue</p>
              <p className="font-medium">{formatCurrency(listing.revenue)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-muted-foreground">EBITDA</p>
              <p className="font-medium">{formatCurrency(listing.ebitda)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-muted-foreground">Location</p>
              <p className="font-medium">{listing.location || '\u2014'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-muted-foreground">Services</p>
              <p className="font-medium">
                {(listing.services?.length ?? 0) > 0
                  ? listing.services!.slice(0, 3).join(', ') +
                    (listing.services!.length > 3 ? ` +${listing.services!.length - 3}` : '')
                  : listing.category || '\u2014'}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
