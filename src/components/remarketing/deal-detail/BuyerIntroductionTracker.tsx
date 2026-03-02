import { useState, useMemo } from 'react';
import { useBuyerIntroductions } from '@/hooks/use-buyer-introductions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Target,
  CheckCircle,
  Clock,
  X,
  Search,
  UserPlus,
  Calendar,
  Mail,
  Phone,
  ChevronRight,
  Linkedin,
  Send,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import type { BuyerIntroduction, IntroductionStatus } from '@/types/buyer-introductions';
import { AddBuyerIntroductionDialog } from './AddBuyerIntroductionDialog';
import { UpdateIntroductionStatusDialog } from './UpdateIntroductionStatusDialog';

interface BuyerIntroductionTrackerProps {
  listingId: string;
  listingTitle?: string;
}

const STATUS_CONFIG: Record<
  IntroductionStatus,
  { label: string; color: string; icon: typeof CheckCircle }
> = {
  not_introduced: {
    label: 'Not Introduced',
    color: 'bg-amber-100 text-amber-700 border-amber-200',
    icon: Target,
  },
  introduction_scheduled: {
    label: 'Scheduled',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    icon: Calendar,
  },
  introduced: {
    label: 'Awaiting Outcome',
    color: 'bg-purple-100 text-purple-700 border-purple-200',
    icon: Clock,
  },
  passed: {
    label: 'Moving Forward',
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    icon: CheckCircle,
  },
  rejected: {
    label: 'Not Interested',
    color: 'bg-slate-100 text-slate-600 border-slate-200',
    icon: X,
  },
};

function formatDealSize(low: number | null, high: number | null): string {
  if (!low && !high) return '--';
  const fmt = (n: number) => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n}`;
  };
  if (low && high) return `${fmt(low)} - ${fmt(high)}`;
  if (low) return `${fmt(low)}+`;
  return `Up to ${fmt(high!)}`;
}

export function BuyerIntroductionTracker({
  listingId,
  listingTitle,
}: BuyerIntroductionTrackerProps) {
  const { introductions, notIntroduced, introducedAndPassed, isLoading } =
    useBuyerIntroductions(listingId);

  const [searchQuery, setSearchQuery] = useState('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedBuyer, setSelectedBuyer] = useState<BuyerIntroduction | null>(null);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);

  const filteredNotIntroduced = useMemo(() => {
    if (!searchQuery) return notIntroduced;
    const q = searchQuery.toLowerCase();
    return notIntroduced.filter(
      (b) => b.buyer_name.toLowerCase().includes(q) || b.buyer_firm_name.toLowerCase().includes(q),
    );
  }, [notIntroduced, searchQuery]);

  const filteredIntroducedPassed = useMemo(() => {
    if (!searchQuery) return introducedAndPassed;
    const q = searchQuery.toLowerCase();
    return introducedAndPassed.filter(
      (b) => b.buyer_name.toLowerCase().includes(q) || b.buyer_firm_name.toLowerCase().includes(q),
    );
  }, [introducedAndPassed, searchQuery]);

  // Stats
  const stats = {
    total: introductions.length,
    notIntroduced: notIntroduced.length,
    introduced: introductions.filter((i) => i.introduction_status === 'introduced').length,
    passed: introductions.filter((i) => i.introduction_status === 'passed').length,
    rejected: introductions.filter((i) => i.introduction_status === 'rejected').length,
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <>
      {/* ─── Section 1: Buyers to Introduce to Deal ─── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4" />
              Buyers to Introduce to Deal
              {filteredNotIntroduced.length > 0 && (
                <Badge variant="secondary" className="text-xs ml-1">
                  {filteredNotIntroduced.length}
                </Badge>
              )}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Buyers queued for introduction — click a buyer to update their status
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 w-48 text-xs"
              />
            </div>
            <Button size="sm" className="gap-1.5" onClick={() => setAddDialogOpen(true)}>
              <UserPlus className="h-3.5 w-3.5" />
              Add Buyer
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {filteredNotIntroduced.length === 0 ? (
            <div className="py-8 text-center">
              <Target className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                {searchQuery
                  ? 'No buyers matching your search'
                  : 'No buyers in the introduction pipeline yet'}
              </p>
              {!searchQuery && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 gap-2"
                  onClick={() => setAddDialogOpen(true)}
                >
                  <UserPlus className="h-4 w-4" />
                  Add First Buyer
                </Button>
              )}
            </div>
          ) : (
            filteredNotIntroduced.map((buyer) => (
              <NotIntroducedCard
                key={buyer.id}
                buyer={buyer}
                onSelect={(b) => {
                  setSelectedBuyer(b);
                  setUpdateDialogOpen(true);
                }}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* ─── Section 2: Buyers Introduced — Passed or Interested ─── */}
      <Card>
        <CardHeader className="pb-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Send className="h-4 w-4" />
              Buyers Introduced — Passed or Interested
              {filteredIntroducedPassed.length > 0 && (
                <Badge variant="secondary" className="text-xs ml-1">
                  {filteredIntroducedPassed.length}
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>Buyers that have been introduced to this deal</span>
              {stats.introduced > 0 && (
                <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">
                  {stats.introduced} Awaiting Outcome
                </Badge>
              )}
              {stats.passed > 0 && (
                <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                  {stats.passed} Moving Forward
                </Badge>
              )}
              {stats.rejected > 0 && (
                <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-600 border-slate-200">
                  {stats.rejected} Not Interested
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {filteredIntroducedPassed.length === 0 ? (
            <div className="py-8 text-center">
              <CheckCircle className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                {searchQuery
                  ? 'No introduced buyers matching your search'
                  : 'No buyers have been introduced yet'}
              </p>
            </div>
          ) : (
            filteredIntroducedPassed.map((buyer) => (
              <IntroducedCard
                key={buyer.id}
                buyer={buyer}
                onSelect={(b) => {
                  setSelectedBuyer(b);
                  setUpdateDialogOpen(true);
                }}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <AddBuyerIntroductionDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        listingId={listingId}
        listingTitle={listingTitle || 'This Deal'}
      />

      {selectedBuyer && (
        <UpdateIntroductionStatusDialog
          open={updateDialogOpen}
          onOpenChange={(open) => {
            setUpdateDialogOpen(open);
            if (!open) setSelectedBuyer(null);
          }}
          buyer={selectedBuyer}
          listingId={listingId}
        />
      )}
    </>
  );
}

// ─── Not Introduced Buyer Card ───
function NotIntroducedCard({
  buyer,
  onSelect,
}: {
  buyer: BuyerIntroduction;
  onSelect: (b: BuyerIntroduction) => void;
}) {
  const config = STATUS_CONFIG[buyer.introduction_status];
  const StatusIcon = config.icon;

  return (
    <div
      onClick={() => onSelect(buyer)}
      className="p-4 rounded-lg border border-border/40 hover:border-border/60 hover:bg-muted/30 transition-colors cursor-pointer space-y-3"
    >
      {/* Row 1: Name + Status */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-foreground">{buyer.buyer_name}</span>
            <span className="text-xs text-muted-foreground">{buyer.buyer_firm_name}</span>
          </div>
        </div>
        <Badge variant="outline" className={`text-[10px] shrink-0 ${config.color}`}>
          <StatusIcon className="h-3 w-3 mr-1" />
          {config.label}
        </Badge>
      </div>

      {/* Row 2: Key Details */}
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div className="bg-muted/50 rounded p-2">
          <div className="text-muted-foreground mb-0.5">Target Size</div>
          <div className="font-medium">
            {formatDealSize(buyer.expected_deal_size_low, buyer.expected_deal_size_high)}
          </div>
        </div>
        <div className="bg-muted/50 rounded p-2">
          <div className="text-muted-foreground mb-0.5">Reason</div>
          <div className="font-medium truncate">
            {buyer.targeting_reason?.split(' - ')[0] || '--'}
          </div>
        </div>
        <div className="bg-muted/50 rounded p-2">
          <div className="text-muted-foreground mb-0.5">Champion</div>
          <div className="font-medium">{buyer.internal_champion || '--'}</div>
        </div>
      </div>

      {/* Row 3: Contact info + timestamps */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        {buyer.buyer_email && (
          <a
            href={`mailto:${buyer.buyer_email}`}
            className="flex items-center gap-1 hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <Mail className="h-3 w-3" />
            <span className="truncate max-w-[180px]">{buyer.buyer_email}</span>
          </a>
        )}
        {buyer.buyer_phone && (
          <span className="flex items-center gap-1">
            <Phone className="h-3 w-3" />
            {buyer.buyer_phone}
          </span>
        )}
        {buyer.buyer_linkedin_url && (
          <a
            href={
              buyer.buyer_linkedin_url.startsWith('http')
                ? buyer.buyer_linkedin_url
                : `https://${buyer.buyer_linkedin_url}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <Linkedin className="h-3 w-3" />
            LinkedIn
          </a>
        )}
        <span className="ml-auto">Added {format(new Date(buyer.created_at), 'MMM d, yyyy')}</span>
      </div>
    </div>
  );
}

// ─── Introduced & Passed Buyer Card ───
function IntroducedCard({
  buyer,
  onSelect,
}: {
  buyer: BuyerIntroduction;
  onSelect: (b: BuyerIntroduction) => void;
}) {
  const config = STATUS_CONFIG[buyer.introduction_status];
  const StatusIcon = config.icon;

  const daysSinceIntroduction = buyer.introduction_date
    ? Math.floor((Date.now() - new Date(buyer.introduction_date).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div
      onClick={() => onSelect(buyer)}
      className="p-4 rounded-lg border border-border/40 hover:border-border/60 hover:bg-muted/30 transition-colors cursor-pointer space-y-3"
    >
      {/* Row 1: Name + Status */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-foreground">{buyer.buyer_name}</span>
            <span className="text-xs text-muted-foreground">{buyer.buyer_firm_name}</span>
          </div>
        </div>
        <Badge variant="outline" className={`text-[10px] shrink-0 ${config.color}`}>
          <StatusIcon className="h-3 w-3 mr-1" />
          {config.label}
        </Badge>
      </div>

      {/* Row 2: Timeline Info */}
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div className="bg-muted/50 rounded p-2">
          <div className="text-muted-foreground mb-0.5">Introduced</div>
          <div className="font-medium">
            {buyer.introduction_date
              ? format(new Date(buyer.introduction_date), 'MMM d, yyyy')
              : '--'}
          </div>
        </div>
        <div className="bg-muted/50 rounded p-2">
          <div className="text-muted-foreground mb-0.5">By</div>
          <div className="font-medium">{buyer.introduced_by || '--'}</div>
        </div>
        <div className="bg-muted/50 rounded p-2">
          <div className="text-muted-foreground mb-0.5">In Pipeline</div>
          <div className="font-medium">
            {daysSinceIntroduction !== null ? `${daysSinceIntroduction}d` : '--'}
          </div>
        </div>
      </div>

      {/* Row 3: Feedback & Next Step */}
      {buyer.buyer_feedback && (
        <p className="text-xs text-muted-foreground italic border-l-2 border-muted pl-3">
          &ldquo;{buyer.buyer_feedback}&rdquo;
        </p>
      )}

      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
        {buyer.next_step && (
          <span className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3" />
            Next: {buyer.next_step}
          </span>
        )}
        {buyer.expected_next_step_date && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {format(new Date(buyer.expected_next_step_date), 'MMM d, yyyy')}
          </span>
        )}
        {buyer.passed_date && (
          <span className="ml-auto">
            Passed {formatDistanceToNow(new Date(buyer.passed_date), { addSuffix: true })}
          </span>
        )}
      </div>
    </div>
  );
}
