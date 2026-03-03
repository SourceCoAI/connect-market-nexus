import { Globe, Pencil, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface GeographicFootprintCardProps {
  targetGeographies?: string[] | null;
  operatingLocations?: string[] | null;
  geographicFootprint?: string[] | null;
  serviceRegions?: string[] | null;
  onEdit: () => void;
  className?: string;
}

export const GeographicFootprintCard = ({
  targetGeographies,
  operatingLocations,
  geographicFootprint,
  serviceRegions,
  onEdit,
  className,
}: GeographicFootprintCardProps) => {
  // Group operating locations by state
  // Handles variations: "Dallas, TX", "Dallas,TX", "Los Angeles, CA, USA", "Denver"
  const locationsByState = operatingLocations?.length
    ? operatingLocations.reduce((acc, loc) => {
        // Strip trailing ", USA" or ", US"
        const cleaned = loc.replace(/,\s*(USA|US)\s*$/i, "");
        // Match the last 2-letter state code after a comma
        const stateMatch = cleaned.match(/,\s*([A-Z]{2})\s*$/i);
        const state = stateMatch ? stateMatch[1].toUpperCase() : "Other";
        const city = stateMatch
          ? cleaned.substring(0, cleaned.lastIndexOf(",")).trim()
          : cleaned.trim();
        if (!acc[state]) acc[state] = [];
        acc[state].push(city || loc);
        return acc;
      }, {} as Record<string, string[]>)
    : null;

  const hasLocations = operatingLocations && operatingLocations.length > 0;
  const hasTargetGeos = targetGeographies && targetGeographies.length > 0;
  const hasFootprint = geographicFootprint && geographicFootprint.length > 0;
  const hasServiceRegions = serviceRegions && serviceRegions.length > 0;
  const hasAnyData = hasLocations || hasTargetGeos || hasFootprint || hasServiceRegions;

  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Globe className="h-4 w-4" />
            Geographic Footprint
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Physical Presence (geographic_footprint state codes) */}
        {hasFootprint && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Physical Presence
            </p>
            <div className="flex flex-wrap gap-1.5">
              {geographicFootprint.map((state) => (
                <Badge key={state} variant="default" className="text-xs">
                  {state}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Service Coverage (service_regions - broader than footprint) */}
        {hasServiceRegions && (
          <div className={hasFootprint ? "pt-3 border-t" : ""}>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Service Coverage
            </p>
            <div className="flex flex-wrap gap-1.5">
              {serviceRegions.map((state) => (
                <Badge key={state} variant="secondary" className="text-xs">
                  {state}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Operating Locations (City, State pairs) */}
        {hasLocations && locationsByState && (
          <div className={(hasFootprint || hasServiceRegions) ? "pt-3 border-t" : ""}>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              <MapPin className="h-3 w-3 inline mr-1" />
              Office Locations ({operatingLocations.length})
            </p>
            <div className="space-y-2">
              {Object.entries(locationsByState).map(([state, cities]) => (
                <div key={state} className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="text-xs font-semibold">
                    {state} ({cities.length})
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {cities.join(", ")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Target Acquisition Geographies */}
        {hasTargetGeos && (
          <div className={(hasFootprint || hasServiceRegions || hasLocations) ? "pt-3 border-t" : ""}>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Target Acquisition Geographies
            </p>
            <div className="flex flex-wrap gap-2">
              {targetGeographies.map((geo) => (
                <Badge key={geo} variant="outline" className="text-sm">
                  {geo}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!hasAnyData && (
          <p className="text-sm text-muted-foreground italic">No geographic preferences specified</p>
        )}
      </CardContent>
    </Card>
  );
};
