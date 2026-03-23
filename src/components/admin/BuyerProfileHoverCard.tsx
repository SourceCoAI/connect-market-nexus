import React from "react";
import { User } from "@/types/admin-users";
import { User as BuyerMetricsUser } from "@/types";
import { GENERIC_EMAIL_DOMAINS } from "@/lib/generic-email-domains";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Badge } from "@/components/ui/badge";
import { Building2, Target, ExternalLink, Check, X, Mail } from "lucide-react";
import { getBuyerTier, formatFinancialRange, getPrimaryMetrics, getProfileCompletionDetails } from "@/lib/buyer-metrics";

interface BuyerProfileHoverCardProps {
  user: User | null | undefined;
  children: React.ReactNode;
}

interface BusinessCategoriesDisplayProps {
  categories: string[] | null | undefined;
  maxVisible?: number;
  className?: string;
}

export const BusinessCategoriesDisplay: React.FC<BusinessCategoriesDisplayProps> = ({
  categories,
  maxVisible = 5,
  className = ""
}) => {
  if (!categories?.length) return null;

  const visible = categories.slice(0, maxVisible);
  const remaining = categories.length - maxVisible;

  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {visible.map((cat, index) => (
        <Badge key={index} variant="secondary" className="text-xs">
          {cat}
        </Badge>
      ))}
      {remaining > 0 && (
        <Badge variant="outline" className="text-xs text-muted-foreground">
          +{remaining} more
        </Badge>
      )}
    </div>
  );
};

const getEmailDomainStatus = (email?: string | null) => {
  if (!email) return { status: 'missing', indicator: 'amber' };
  const domain = email.split('@')[1]?.toLowerCase();
  if (domain && GENERIC_EMAIL_DOMAINS.has(domain)) {
    return { status: 'personal', indicator: 'red' };
  }
  return { status: 'company', indicator: 'green' };
};

const CredibilityIndicators: React.FC<{ user: User }> = ({ user }) => {
  const emailStatus = getEmailDomainStatus(user.email);
  const hasLinkedIn = !!user.linkedin_profile;
  const hasWebsite = !!user.website;
  const completionDetails = getProfileCompletionDetails(user as unknown as BuyerMetricsUser);
  const dataCompleteness = completionDetails.percentage;
  
  return (
    <div className="flex items-center gap-2 text-xs">
      {/* Email Domain Indicator */}
      <div className="flex items-center gap-1">
        <Mail className="h-3 w-3" />
        <div className={`w-2 h-2 rounded-full ${
          emailStatus.indicator === 'green' ? 'bg-green-500' : 
          emailStatus.indicator === 'red' ? 'bg-red-500' : 'bg-amber-500'
        }`} />
      </div>
      
      {/* LinkedIn Status */}
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground">LI</span>
        {hasLinkedIn ? <Check className="h-3 w-3 text-green-500" /> : <X className="h-3 w-3 text-red-500" />}
      </div>
      
      {/* Website Status */}
      <div className="flex items-center gap-1">
        <ExternalLink className="h-3 w-3" />
        {hasWebsite ? <Check className="h-3 w-3 text-green-500" /> : <X className="h-3 w-3 text-red-500" />}
      </div>
      
      {/* Data Completeness */}
      <Badge variant="outline" className="text-xs">
        {Math.round(dataCompleteness)}% complete
      </Badge>
    </div>
  );
};

export const BuyerProfileHoverCard: React.FC<BuyerProfileHoverCardProps> = ({
  user,
  children,
}) => {
  if (!user) {
    return <>{children}</>;
  }

  const tierInfo = getBuyerTier(user as unknown as BuyerMetricsUser);
  const revenueRange = formatFinancialRange(user.revenue_range_min, user.revenue_range_max);
  const primaryMetrics = getPrimaryMetrics(user as unknown as BuyerMetricsUser);
  
  // Truncate description for hover preview
  const truncateText = (text: string, maxLength = 200) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + "...";
  };

  const businessDescription = user.ideal_target_description || user.specific_business_search;
  const hasBusinessInfo = businessDescription || user.business_categories?.length;

  if (!hasBusinessInfo) {
    return <>{children}</>;
  }

  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        {children}
      </HoverCardTrigger>
      <HoverCardContent 
        className="w-80 max-h-96 overflow-y-auto p-4 bg-card border border-border shadow-lg"
        side="right"
        align="start"
      >
        <div className="space-y-3">
          {/* Header */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-sm">
                  {user.first_name} {user.last_name}
                </h4>
                {user.linkedin_profile && (
                  <a 
                    href={user.linkedin_profile} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:text-blue-600 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <Badge variant="outline" className="text-xs">
                {tierInfo.badge}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {user.company && (
                <>
                  <Building2 className="h-3 w-3" />
                  <span>{user.company}</span>
                </>
              )}
            </div>
            
            {/* Credibility Indicators */}
            <CredibilityIndicators user={user} />
          </div>

          {/* Primary Financial Metrics */}
          {primaryMetrics.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground">Financial Profile</span>
              <div className="grid grid-cols-1 gap-1">
                {primaryMetrics.slice(0, 2).map((metric, index) => (
                  <div key={index} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{metric.label}:</span>
                    <span className="font-medium">{metric.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Business Description */}
          {businessDescription && (
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Target className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Target Description</span>
              </div>
              <p className="text-xs text-card-foreground leading-relaxed">
                "{truncateText(businessDescription)}"
              </p>
            </div>
          )}

          {/* Business Categories */}
          {user.business_categories?.length && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground">Focus Areas</span>
              <BusinessCategoriesDisplay 
                categories={user.business_categories} 
                maxVisible={5}
              />
            </div>
          )}

          {/* Revenue Target */}
          {revenueRange && (
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Revenue Target</span>
              <p className="text-xs text-card-foreground">{revenueRange}</p>
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};