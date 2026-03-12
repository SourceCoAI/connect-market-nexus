import { Monitor, Smartphone, Tablet, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { countryCodeToFlag } from '@/lib/flagEmoji';
import { format } from 'date-fns';
import type { EnhancedActiveUser } from '@/hooks/useEnhancedRealTimeAnalytics';
import { JourneyPath } from './JourneyPath';
import { EngagementDepth } from './EngagementDepth';

interface MapboxTooltipCardProps {
  user: EnhancedActiveUser;
  position: { x: number; y: number };
  onClose: () => void;
}

// DiceBear avatar URL generator
function getAvatarUrl(user: EnhancedActiveUser): string {
  const seed = user.sessionId || user.displayName;
  return `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
}

function getDisplayReferrer(_referrer: string | null, _utmSource: string | null, entrySource: string): { icon: string; name: string } {
  // Use the normalized entrySource from the analytics hook
  const sourceIcons: Record<string, string> = {
    'Google': '🔍',
    'YouTube': '▶️',
    'Facebook': '📘',
    'LinkedIn': '💼',
    'X (Twitter)': '𝕏',
    'Instagram': '📷',
    'TikTok': '🎵',
    'Direct': '→',
    'Lovable': '💜',
    'SourceCoDeals': '🏢',
    'Email (Brevo)': '✉️',
  };
  
  return {
    icon: sourceIcons[entrySource] || '🌐',
    name: entrySource || 'Direct',
  };
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

function formatTotalTime(seconds: number): string {
  if (seconds < 60) return `${seconds} sec total`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} min total`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m total`;
}

// Buyer type display names and colors
const buyerTypeConfig: Record<string, { label: string; className: string }> = {
  'private_equity': { label: 'Private Equity', className: 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/20' },
  'family_office': { label: 'Family Office', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
  'corporate': { label: 'Corporate / Strategic', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20' },
  'search_fund': { label: 'Search Fund', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20' },
  'independent_sponsor': { label: 'Independent Sponsor', className: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/20' },
  'individual_buyer': { label: 'Individual Buyer', className: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/20' },
};

export function MapboxTooltipCard({
  user,
  position,
  onClose,
}: MapboxTooltipCardProps) {
  const flag = countryCodeToFlag(user.countryCode);
  const location = [user.city, user.country].filter(Boolean).join(', ') || 'Unknown';
  const referrer = getDisplayReferrer(user.referrer, user.utmSource, user.entrySource);
  const buyerConfig = user.buyerType ? buyerTypeConfig[user.buyerType] : null;

  // Position calculation to keep tooltip on screen
  const left = Math.min(position.x + 16, window.innerWidth - 360);
  const top = Math.max(Math.min(position.y - 150, window.innerHeight - 580), 10);

  return (
    <div
      className="fixed z-50 w-[340px] rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-border/50 overflow-hidden"
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="p-4 border-b border-border/30 bg-gradient-to-b from-muted/40 to-transparent relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-muted/80 transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>

        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-white/80 shadow-md flex-shrink-0">
            <img 
              src={getAvatarUrl(user)} 
              alt={user.displayName}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Identity */}
          <div className="flex-1 min-w-0 pr-6">
            <p className="font-semibold text-foreground truncate text-[15px]">
              {user.displayName}
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <span>{flag}</span>
              <span className="truncate">{location}</span>
            </p>
            
            {/* Device info - minimal */}
            <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-muted-foreground/70">
              <DeviceIcon type={user.deviceType} />
              <span>{user.browser || 'Browser'}</span>
              <span className="opacity-40">•</span>
              <span>{user.os || 'OS'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Path Intelligence */}
      <div className="p-4 border-b border-border/30 space-y-3">
        <SectionLabel>Path Intelligence</SectionLabel>
        
        {/* Entry point - external referrer if available */}
        {user.externalReferrer && (
          <InfoRow
            label="Entry point"
            value={
              <span className="font-mono text-[10px] bg-gradient-to-r from-blue-500/10 to-blue-400/5 px-2 py-0.5 rounded border border-blue-500/15 text-blue-600 dark:text-blue-400">
                {user.externalReferrer}
              </span>
            }
          />
        )}
        
        <InfoRow
          label="Source"
          value={
            <span className="flex items-center gap-1.5">
              <span className="text-sm">{referrer.icon}</span>
              <span className="text-xs">{referrer.name}</span>
            </span>
          }
        />
        
        <InfoRow
          label="Landing"
          value={
            <span className="font-mono text-[10px] bg-muted/40 px-1.5 py-0.5 rounded">
              {user.firstPagePath || '/'}
            </span>
          }
        />
        
        <InfoRow
          label="Current"
          value={
            <span className="font-mono text-[10px] bg-coral-500/10 text-coral-600 dark:text-coral-400 px-1.5 py-0.5 rounded border border-coral-500/15">
              {user.currentPage || '/'}
            </span>
          }
        />
        
        <InfoRow 
          label="Session" 
          value={
            <span className="tabular-nums font-medium">
              {formatDuration(user.sessionDurationSeconds)}
            </span>
          } 
        />

        {/* Journey path visualization */}
        {user.pageSequence.length > 0 && (
          <div className="pt-2">
            <span className="text-[10px] text-muted-foreground/60 mb-1 block">Journey this session</span>
            <JourneyPath pages={user.pageSequence} />
          </div>
        )}
      </div>

      {/* Cross-Session History - for all users with history */}
      {user.visitorTotalSessions > 1 && (
        <div className="px-4 py-3 border-b border-border/30 bg-muted/20 space-y-2">
          <SectionLabel>Cross-Session History</SectionLabel>
          <div className="grid grid-cols-3 gap-2">
            <HistoryStat 
              label="Total visits" 
              value={user.visitorTotalSessions.toString()} 
            />
            <HistoryStat 
              label="First seen" 
              value={user.visitorFirstSeen ? format(new Date(user.visitorFirstSeen), 'MMM d') : '-'} 
            />
            <HistoryStat 
              label="Time spent" 
              value={formatTotalTime(user.visitorTotalTime)} 
            />
          </div>
        </div>
      )}

      {/* Engagement Depth - premium visualization */}
      <div className="p-4 border-b border-border/30 space-y-3">
        <SectionLabel>Engagement Depth</SectionLabel>
        <EngagementDepth
          listingsViewed={user.listingsViewed}
          listingsSaved={user.listingsSaved}
          connectionsSent={user.connectionsSent}
        />
      </div>

      {/* Buyer Profile - only for logged-in users */}
      {!user.isAnonymous && (
        <div className="p-4 space-y-3">
          <SectionLabel>Buyer Profile</SectionLabel>
          
          {/* Buyer Type Badge */}
          {buyerConfig && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Type</span>
              <span className={cn(
                "text-[10px] font-medium px-2.5 py-1 rounded-full border",
                buyerConfig.className
              )}>
                {buyerConfig.label}
              </span>
            </div>
          )}
          
          {/* Trust status - compact visual badges */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Qualification</span>
            <div className="flex items-center gap-1.5">
              <QualificationBadge 
                label="NDA" 
                status={user.ndaSigned ? 'complete' : 'pending'} 
              />
              <QualificationBadge 
                label="Fee" 
                status={user.feeAgreementSigned ? 'complete' : 'pending'} 
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-muted-foreground/70 text-[10px] uppercase tracking-[0.12em] font-medium">
      {children}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground/80">{label}</span>
      <span className="text-xs text-foreground">{value}</span>
    </div>
  );
}

function HistoryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-sm font-medium text-foreground tabular-nums">{value}</div>
      <div className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">{label}</div>
    </div>
  );
}

function QualificationBadge({ label, status }: { label: string; status: 'complete' | 'pending' }) {
  return (
    <span className={cn(
      "text-[9px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wider",
      status === 'complete' 
        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
        : "bg-muted/50 text-muted-foreground/60 border border-border/50"
    )}>
      {label}
    </span>
  );
}

function DeviceIcon({ type }: { type: string }) {
  const className = "w-3 h-3 opacity-60";
  switch (type) {
    case 'mobile':
      return <Smartphone className={className} />;
    case 'tablet':
      return <Tablet className={className} />;
    default:
      return <Monitor className={className} />;
  }
}
