import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const SOURCE_CONFIG: Record<string, { label: string; className: string }> = {
  captarget: {
    label: "CapTarget",
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  referral: {
    label: "Referral",
    className: "bg-purple-50 text-purple-700 border-purple-200",
  },
  marketplace: {
    label: "Marketplace",
    className: "bg-green-50 text-green-700 border-green-200",
  },
  gp_partners: {
    label: "GP Partners",
    className: "bg-orange-50 text-orange-700 border-orange-200",
  },
  sourceco: {
    label: "SourceCo",
    className: "bg-cyan-50 text-cyan-700 border-cyan-200",
  },
  valuation_calculator: {
    label: "Calculator",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  remarketing: {
    label: "Remarketing",
    className: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  salesforce_remarketing: {
    label: "Salesforce",
    className: "bg-teal-50 text-teal-700 border-teal-200",
  },
  smartlead: {
    label: "SmartLead",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  manual: {
    label: "Manual",
    className: "bg-gray-50 text-gray-600 border-gray-200",
  },
};

interface DealSourceBadgeProps {
  source: string | null | undefined;
  className?: string;
}

export function DealSourceBadge({ source, className }: DealSourceBadgeProps) {
  const config = SOURCE_CONFIG[source || "manual"] || SOURCE_CONFIG.manual;

  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] font-semibold px-1.5 py-0", config.className, className)}
    >
      {config.label}
    </Badge>
  );
}
