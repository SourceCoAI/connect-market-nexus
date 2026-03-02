import { TrendingUp, Users, DollarSign, MapPin, ExternalLink } from "lucide-react";
import { cn, formatCompactCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { CategoryLocationBadges } from "@/components/shared/CategoryLocationBadges";
import { toStandardCategory, toStandardLocation } from "@/lib/standardization";
import AcquisitionTypeBadge from "@/components/listing/AcquisitionTypeBadge";

interface DealMetricsCardProps {
  listing: {
    id?: string;
    title: string;
    category?: string;
    location?: string;
    image_url?: string | null;
    revenue?: number;
    ebitda?: number;
    full_time_employees?: number;
    part_time_employees?: number;
    acquisition_type?: 'add_on' | 'platform' | string | null;
  };
  status: string;
  className?: string;
}


export function DealMetricsCard({ listing, status, className }: DealMetricsCardProps) {
  const totalEmployees = (listing.full_time_employees || 0) + (listing.part_time_employees || 0);
  
  // Standardize category and location
  const standardCategory = listing.category ? toStandardCategory(listing.category) : undefined;
  const standardLocation = listing.location ? toStandardLocation(listing.location) : undefined;
  
  const getStatusConfig = (status: string) => {
    switch (status) {
      case "approved":
        return { 
          label: "Approved", 
          className: "bg-[#0E101A] text-[#DEC76B] border-[#0E101A]" 
        };
      case "rejected":
        return { 
          label: "Not Selected", 
          className: "bg-slate-50 text-slate-700 border-slate-200" 
        };
      case "pending":
      default:
        return { 
          label: "Under Review", 
          className: "bg-[#F5F0E8] text-[#8B6F47] border-[#E5DDD0]" 
        };
    }
  };

  const statusConfig = getStatusConfig(status);
  
  const metrics = [
    {
      label: "Revenue",
      value: listing.revenue ? formatCompactCurrency(listing.revenue) : "N/A",
      icon: TrendingUp,
    },
    {
      label: "EBITDA",
      value: listing.ebitda ? formatCompactCurrency(listing.ebitda) : "N/A",
      icon: DollarSign,
    },
    {
      label: "Employees",
      value: totalEmployees > 0 ? totalEmployees.toString() : "N/A",
      icon: Users,
    },
    {
      label: "Location",
      value: standardLocation || "N/A",
      icon: MapPin,
    },
  ];

  return (
    <div className={cn("relative bg-white rounded-lg p-6 shadow-[0_2px_12px_0_rgba(0,0,0,0.05),0_1px_4px_0_rgba(0,0,0,0.08)] hover:shadow-[0_8px_16px_0_rgba(0,0,0,0.06),0_2px_6px_0_rgba(0,0,0,0.08)] transition-shadow duration-300", className)}>
      <div className="flex items-start gap-6">
        {/* Image Thumbnail */}
        {listing.image_url && (
          <div className="shrink-0">
            <img
              src={listing.image_url}
              alt={listing.title}
              loading="lazy"
              className="w-48 h-48 object-cover rounded-lg border border-gray-200 bg-gray-50"
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* Header with Title and Status */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1.5">
                <h2 className="text-xl font-semibold text-gray-900 tracking-tight">
                  {listing.title}
                </h2>
                {listing.id && (
                  <Link
                    to={`/listing/${listing.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-md transition-colors"
                  >
                    View listing
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                )}
              </div>
              <div className="flex items-center gap-2">
                <CategoryLocationBadges 
                  category={standardCategory}
                  location={standardLocation}
                  variant="default"
                  className="mt-0.5"
                />
                {listing.acquisition_type && (
                  <AcquisitionTypeBadge type={listing.acquisition_type} />
                )}
              </div>
            </div>
            
            {/* Status Badge */}
            <Badge 
              variant="outline" 
              className={cn(
                "inline-flex items-center gap-1.5 h-6 px-2.5 py-0 text-xs font-medium rounded-full shrink-0",
                statusConfig.className
              )}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-current" />
              {statusConfig.label}
            </Badge>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 pt-5 mt-5 border-t border-gray-100">
            {metrics.map((metric) => (
              <div key={metric.label} className="space-y-1.5">
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-[0.1em]">
                  {metric.label}
                </div>
                <div className="text-xl font-semibold text-gray-900 tabular-nums">
                  {metric.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
