import { format } from "date-fns";
import { Link, useLocation } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ExternalLink,
  Phone,
  FileText,
  FileCheck,
  Calendar,
  } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScoreBadge } from "@/components/shared/ScoreBadge";
import type { ScoreTier } from "@/types/remarketing";

interface OutreachRecord {
  contacted_at?: string | null;
  nda_sent_at?: string | null;
  nda_signed_at?: string | null;
  cim_sent_at?: string | null;
  meeting_scheduled_at?: string | null;
  outcome?: string | null;
}

interface IntroductionStatusCardProps {
  buyerId: string;
  buyerName: string;
  buyerWebsite?: string | null;
  buyerType?: string | null;
  score: number;
  tier: ScoreTier;
  outreach: OutreachRecord | null;
  onStatusChange: (field: string, checked: boolean) => void;
  onOutcomeChange: (outcome: string) => void;
  isUpdating?: boolean;
}

const outcomeOptions = [
  { value: 'none', label: 'No Outcome' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'no_response', label: 'No Response' },
];

export const IntroductionStatusCard = ({
  buyerId,
  buyerName,
  buyerWebsite,
  buyerType,
  score,
  tier,
  outreach,
  onStatusChange,
  onOutcomeChange,
  isUpdating,
}: IntroductionStatusCardProps) => {
  const location = useLocation();
  const checkboxFields = [
    { key: 'contacted_at', label: 'Contacted', icon: Phone },
    { key: 'nda_sent_at', label: 'NDA Sent', icon: FileText },
    { key: 'nda_signed_at', label: 'NDA Signed', icon: FileCheck },
    { key: 'cim_sent_at', label: 'Memo Sent', icon: FileText },
    { key: 'meeting_scheduled_at', label: 'Meeting', icon: Calendar },
  ];

  return (
    <Card className={cn(
      "transition-all",
      outreach?.outcome === 'won' && "border-emerald-200 bg-emerald-50/30",
      outreach?.outcome === 'lost' && "border-red-200 bg-red-50/30",
      isUpdating && "opacity-70"
    )}>
      <CardContent className="p-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          {/* Buyer Info */}
          <div className="flex items-center gap-3 min-w-[200px]">
            <div className="flex-shrink-0">
              <ScoreBadge variant="numeric" score={score} size="sm" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Link
                  to={`/admin/buyers/${buyerId}`}
                  state={{ from: location.pathname }}
                  className="font-medium hover:underline truncate"
                >
                  {buyerName}
                </Link>
                {buyerWebsite && (
                  <a
                    href={buyerWebsite.startsWith('http') ? buyerWebsite : `https://${buyerWebsite}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-primary"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <ScoreBadge variant="tier" tier={tier} size="sm" />
                {buyerType && (
                  <Badge variant="outline" className="text-xs capitalize">
                    {buyerType.replace('_', ' ')}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Status Checkboxes */}
          <div className="flex flex-wrap items-center gap-4 flex-1">
            {checkboxFields.map(({ key, label, icon: Icon }) => {
              const isChecked = !!outreach?.[key as keyof OutreachRecord];
              const timestamp = outreach?.[key as keyof OutreachRecord];
              
              return (
                <div key={key} className="flex items-center gap-2">
                  <Checkbox
                    id={`${buyerId}-${key}`}
                    checked={isChecked}
                    onCheckedChange={(checked) => onStatusChange(key, !!checked)}
                    disabled={isUpdating}
                  />
                  <label
                    htmlFor={`${buyerId}-${key}`}
                    className={cn(
                      "text-sm cursor-pointer flex items-center gap-1",
                      isChecked ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    <span className="hidden sm:inline">{label}</span>
                    {isChecked && timestamp && typeof timestamp === 'string' && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({format(new Date(timestamp), 'M/d')})
                      </span>
                    )}
                  </label>
                </div>
              );
            })}
          </div>

          {/* Outcome Selector */}
          <div className="flex-shrink-0 w-36">
            <Select
              value={outreach?.outcome || 'none'}
              onValueChange={onOutcomeChange}
              disabled={isUpdating}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Outcome" />
              </SelectTrigger>
              <SelectContent>
                {outcomeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default IntroductionStatusCard;
