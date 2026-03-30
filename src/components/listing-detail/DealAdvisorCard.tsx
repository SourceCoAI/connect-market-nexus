import { ArrowRight } from 'lucide-react';
import { useAdminProfiles } from '@/hooks/admin/use-admin-profiles';
import { useConnectionStatus } from '@/hooks/marketplace/use-connections';
import { getAdminProfile } from '@/lib/admin-profiles';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface DealAdvisorCardProps {
  presentedByAdminId: string | null | undefined;
  listingId: string;
}

export function DealAdvisorCard({ presentedByAdminId, listingId }: DealAdvisorCardProps) {
  const { data: adminProfiles } = useAdminProfiles();
  const { data: _connectionStatus } = useConnectionStatus(listingId);
  
  // Get the advisor profile from database admin profiles
  let advisorProfile = {
    displayName: 'Tomos Mughan',
    title: 'CEO',
    email: 'tomos.mughan@sourceco.com',
  };

  if (presentedByAdminId) {
    // Try to get from admin profiles hook first (database)
    if (adminProfiles?.[presentedByAdminId]) {
      const dbProfile = adminProfiles[presentedByAdminId];
      const staticProfile = getAdminProfile(dbProfile.email);
      advisorProfile = {
        displayName: `${dbProfile.first_name} ${dbProfile.last_name}`.trim() || dbProfile.email,
        title: staticProfile?.title || 'Advisor',
        email: dbProfile.email,
      };
    } else {
      // Try to get from static admin profiles (using email as ID)
      const staticProfile = getAdminProfile(presentedByAdminId);
      if (staticProfile) {
        advisorProfile = {
          displayName: staticProfile.name,
          title: staticProfile.title,
          email: staticProfile.email,
        };
      }
    }
  }

  const displayName = advisorProfile.displayName.split(' ')[0];

  return (
    <div className="bg-white/40 border border-slate-200/60 rounded-lg p-4 shadow-sm">
      <h4 className="text-[10px] font-medium text-foreground mb-3 uppercase tracking-wider">
        Deal Presented By
      </h4>
      
      <div className="flex items-start gap-2.5 mb-3">
        <Avatar className="w-10 h-10 flex-shrink-0">
          <AvatarFallback className="bg-primary/10 text-primary text-xs">
            {advisorProfile.displayName.split(' ').map(n => n[0]).join('')}
          </AvatarFallback>
        </Avatar>
        
        <div className="min-w-0">
          <div className="font-medium text-xs text-foreground leading-tight">
            {advisorProfile.displayName}
          </div>
          <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
            {advisorProfile.title}
          </div>
        </div>
      </div>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              disabled={true}
              className="group flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors opacity-50 cursor-not-allowed"
            >
              <span>Contact {displayName}</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs max-w-[240px]">
            <p>This deal is presented by {displayName}, who will be in touch with next steps shortly after you request full deal details</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
