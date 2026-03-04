import { useNavigate, useLocation } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, ExternalLink, Plus } from "lucide-react";

interface PlatformsTabProps {
  firmName: string;
  platforms: Array<{
    id: string;
    company_name: string | null;
    company_website: string | null;
    buyer_type: string | null;
    business_summary: string | null;
    thesis_summary: string | null;
    hq_city: string | null;
    hq_state: string | null;
    has_fee_agreement: boolean | null;
    marketplace_firm_id: string | null;
    universe: { id: string; name: string } | null;
  }>;
  platformsLoading: boolean;
  onAddPlatform: () => void;
}

export const PlatformsTab = ({
  firmName,
  platforms,
  platformsLoading,
  onAddPlatform,
}: PlatformsTabProps) => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Platform Companies</h3>
          <p className="text-sm text-muted-foreground">
            Operating companies under {firmName} in our system
          </p>
        </div>
        <Button size="sm" onClick={onAddPlatform}>
          <Plus className="mr-2 h-4 w-4" />
          Add Platform Company
        </Button>
      </div>

      {platformsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : platforms.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="font-medium text-muted-foreground">
              No platform companies connected yet
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Add a platform company to start tracking their deal activity
            </p>
            <Button
              size="sm"
              className="mt-4"
              onClick={onAddPlatform}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Platform Company
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {platforms.map((platform) => (
            <Card
              key={platform.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => navigate(`/admin/buyers/${platform.id}`, { state: { from: location.pathname } })}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground truncate">
                        {platform.company_name}
                      </span>
                    </div>
                    {(platform.universe as { name?: string } | null)?.name && (
                      <Badge variant="secondary" className="text-xs">
                        {(platform.universe as { name?: string } | null)?.name}
                      </Badge>
                    )}
                    {platform.company_website && (
                      <a
                        href={platform.company_website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {platform.company_website
                          .replace(/^https?:\/\//, "")
                          .replace(/\/$/, "")}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {(platform.business_summary || platform.thesis_summary) && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                        {platform.business_summary || platform.thesis_summary}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0 ml-3">
                    {platform.has_fee_agreement && (
                      <Badge variant="outline" className="text-xs text-green-600 border-green-200">
                        Fee Agmt
                      </Badge>
                    )}
                    {platform.marketplace_firm_id && (
                      <Badge variant="outline" className="text-xs text-blue-600 border-blue-200">
                        Marketplace
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
