import { memo } from "react";
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ExternalLink, User, Upload, Bot, Mail, Link, Users, Store } from 'lucide-react';

interface SourceBadgeProps {
  source: 'marketplace' | 'webflow' | 'manual' | 'import' | 'api' | 'website' | 'referral' | 'cold_outreach' | 'networking' | 'linkedin' | 'email' | 'landing_page' | 'landing_page_email_capture';
  className?: string;
}

const sourceConfigs: Record<string, { label: string; className: string; icon: React.ReactNode; tooltip: string }> = {
  webflow: {
    label: 'Webflow',
    className: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    icon: <ExternalLink className="h-3 w-3 mr-1" />,
    tooltip: 'This lead was submitted via a Webflow deal memo page on the SourceCo website.',
  },
  website: {
    label: 'Website',
    className: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20',
    icon: <Link className="h-3 w-3 mr-1" />,
    tooltip: 'This request originated from the SourceCo website.',
  },
  referral: {
    label: 'Referral',
    className: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    icon: <Users className="h-3 w-3 mr-1" />,
    tooltip: 'This request came through a referral.',
  },
  cold_outreach: {
    label: 'Cold Outreach',
    className: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
    icon: <ExternalLink className="h-3 w-3 mr-1" />,
    tooltip: 'This request originated from cold outreach efforts.',
  },
  networking: {
    label: 'Networking',
    className: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20',
    icon: <Users className="h-3 w-3 mr-1" />,
    tooltip: 'This request came through networking.',
  },
  linkedin: {
    label: 'LinkedIn',
    className: 'bg-sky-500/10 text-sky-600 border-sky-500/20',
    icon: <ExternalLink className="h-3 w-3 mr-1" />,
    tooltip: 'This request originated from LinkedIn.',
  },
  email: {
    label: 'Email',
    className: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
    icon: <Mail className="h-3 w-3 mr-1" />,
    tooltip: 'This request came via email.',
  },
  landing_page: {
    label: 'Landing Page',
    className: 'bg-teal-500/10 text-teal-600 border-teal-500/20',
    icon: <ExternalLink className="h-3 w-3 mr-1" />,
    tooltip: 'This request came from a landing page.',
  },
  landing_page_email_capture: {
    label: 'Landing Page',
    className: 'bg-teal-500/10 text-teal-600 border-teal-500/20',
    icon: <ExternalLink className="h-3 w-3 mr-1" />,
    tooltip: 'This request came from a landing page email capture.',
  },
  manual: {
    label: 'Manual',
    className: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
    icon: <User className="h-3 w-3 mr-1" />,
    tooltip: 'This request was manually entered by an admin.',
  },
  import: {
    label: 'Import',
    className: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
    icon: <Upload className="h-3 w-3 mr-1" />,
    tooltip: 'This request was imported from an external source.',
  },
  api: {
    label: 'API',
    className: 'bg-green-500/10 text-green-600 border-green-500/20',
    icon: <Bot className="h-3 w-3 mr-1" />,
    tooltip: 'This request was created via API.',
  },
  marketplace: {
    label: 'Marketplace',
    className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
    icon: <Store className="h-3.5 w-3.5 mr-1" />,
    tooltip: 'This request was submitted through the SourceCo Marketplace by a registered user.',
  },
};

export const SourceBadge = memo(function SourceBadge({ source, className }: SourceBadgeProps) {
  const config = sourceConfigs[source] ?? sourceConfigs.marketplace;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`text-xs cursor-help ${config.className} ${className ?? ''}`}>
            {config.icon}
            {config.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[260px] text-xs">
          {config.tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
