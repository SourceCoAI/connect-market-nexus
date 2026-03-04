import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, Building2, ExternalLink, MapPin, Pencil, Sparkles, Calendar, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";

interface BuyerDetailHeaderProps {
  companyName: string;
  peFirmName?: string | null;
  peFirmId?: string | null;
  platformWebsite?: string | null;
  hqCity?: string | null;
  hqState?: string | null;
  hqCountry?: string | null;
  investmentDate?: string | null;
  dataCompleteness: number;
  onEdit: () => void;
  onEnrich: () => void;
  isEnriching?: boolean;
  backTo?: string;
  marketplaceFirmId?: string | null;
}

export const BuyerDetailHeader = ({
  companyName,
  peFirmName,
  peFirmId,
  platformWebsite,
  hqCity,
  hqState,
  hqCountry,
  investmentDate,
  dataCompleteness,
  onEdit,
  onEnrich,
  isEnriching = false,
  backTo = "/admin/buyers",
  marketplaceFirmId,
}: BuyerDetailHeaderProps) => {
  const location = useLocation();
  const hqLocation = [hqCity, hqState, hqCountry].filter(Boolean).join(", ");
  
  const formatInvestmentDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return null;
    try {
      const date = parseISO(dateStr);
      return format(date, "MMM yyyy");
    } catch {
      return dateStr;
    }
  };

  const formattedInvestmentDate = formatInvestmentDate(investmentDate);
  
  const getCompletenessColor = (value: number) => {
    if (value >= 70) return "bg-green-100 text-green-800 border-green-200";
    if (value >= 40) return "bg-yellow-100 text-yellow-800 border-yellow-200";
    return "bg-muted text-muted-foreground";
  };

  return (
    <div className="space-y-4">
      {/* Navigation and Actions Row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" asChild className="mt-1">
            <Link to={backTo}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          
          <div className="space-y-1">
            {/* Company Name + Completeness Badge */}
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{companyName}</h1>
              <Badge 
                variant="outline" 
                className={`text-sm font-medium ${getCompletenessColor(dataCompleteness)}`}
              >
                {dataCompleteness}%
              </Badge>
            </div>
            
            {/* PE Firm Name + Marketplace Badge */}
            <div className="flex items-center gap-3">
              {peFirmName && (
                peFirmId ? (
                  <Link
                    to={`/admin/buyers/pe-firms/${peFirmId}`}
                    state={{ from: location.pathname }}
                    className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Building2 className="h-4 w-4" />
                    <span className="hover:underline">{peFirmName}</span>
                  </Link>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Building2 className="h-4 w-4" />
                    <span>{peFirmName}</span>
                  </div>
                )
              )}
              {marketplaceFirmId && (
                <Link to="/admin/marketplace/users" className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 transition-colors border border-blue-200">
                  <Store className="h-3 w-3" />
                  Marketplace Firm
                </Link>
              )}
            </div>
            
            {/* Platform Website + HQ Location + Investment Date */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              {platformWebsite && (
                <a 
                  href={platformWebsite.startsWith('http') ? platformWebsite : `https://${platformWebsite}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-primary transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Platform Website</span>
                </a>
              )}
              {hqLocation && (
                <div className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>HQ: {hqLocation}</span>
                </div>
              )}
              {formattedInvestmentDate && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Invested: {formattedInvestmentDate}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onEdit}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button 
            variant="outline" 
            onClick={onEnrich}
            disabled={isEnriching}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {isEnriching ? "Enriching..." : "Enrich"}
          </Button>
        </div>
      </div>
    </div>
  );
};
