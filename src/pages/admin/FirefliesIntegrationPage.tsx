import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Phone,
  Users,
  Building2,
  RefreshCw,
  Loader2,
  CheckCircle2,
  FileText,
  Clock,
  Download,
} from 'lucide-react';
import { useFirefliesAutoPair } from '@/hooks/useFirefliesAutoPair';
import { useFirefliesBulkSync } from '@/hooks/useFirefliesBulkSync';

// ---------------------------------------------------------------------------
// Stats hooks
// ---------------------------------------------------------------------------

function useFirefliesStats() {
  return useQuery({
    queryKey: ['fireflies-integration-stats'],
    queryFn: async () => {
      // Buyer transcripts linked via Fireflies
      const { count: buyerTranscriptCount } = await supabase
        .from('buyer_transcripts')
        .select('id', { count: 'exact', head: true });

      // Buyers that have at least one transcript
      const { data: buyerIds } = await supabase.from('buyer_transcripts').select('buyer_id');
      const uniqueBuyerIds = new Set((buyerIds || []).map((r) => r.buyer_id));

      // Deal transcripts from Fireflies
      const { count: dealFirefliesCount } = await supabase
        .from('deal_transcripts')
        .select('id', { count: 'exact', head: true })
        .eq('source', 'fireflies');

      // Auto-linked deal transcripts
      const { count: autoLinkedCount } = await supabase
        .from('deal_transcripts')
        .select('id', { count: 'exact', head: true })
        .eq('auto_linked', true);

      // Total deals with Fireflies transcripts
      const { data: dealIds } = await supabase
        .from('deal_transcripts')
        .select('listing_id')
        .eq('source', 'fireflies');
      const uniqueDealIds = new Set((dealIds || []).map((r) => r.listing_id));

      // Total active buyers
      const { count: totalBuyers } = await supabase
        .from('buyers')
        .select('id', { count: 'exact', head: true })
        .eq('archived', false);

      // Total active deals
      const { count: totalDeals } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null);

      // Buyers with contacts (have emails to match against)
      const { data: buyersWithContacts } = await supabase
        .from('contacts')
        .select('remarketing_buyer_id')
        .eq('contact_type', 'buyer')
        .eq('archived', false)
        .not('email', 'is', null)
        .not('remarketing_buyer_id', 'is', null);
      const buyersWithEmail = new Set(
        (buyersWithContacts || []).map((c) => c.remarketing_buyer_id),
      );

      return {
        buyerTranscriptCount: buyerTranscriptCount ?? 0,
        buyersWithTranscripts: uniqueBuyerIds.size,
        dealFirefliesCount: dealFirefliesCount ?? 0,
        autoLinkedCount: autoLinkedCount ?? 0,
        dealsWithTranscripts: uniqueDealIds.size,
        totalBuyers: totalBuyers ?? 0,
        totalDeals: totalDeals ?? 0,
        buyersWithEmail: buyersWithEmail.size,
      };
    },
    staleTime: 30_000,
  });
}

function useRecentPairings() {
  return useQuery({
    queryKey: ['fireflies-recent-pairings'],
    queryFn: async () => {
      const { data: recentBuyer } = await supabase
        .from('buyer_transcripts')
        .select('id, title, call_date, created_at, buyer:buyers(company_name)')
        .order('created_at', { ascending: false })
        .limit(5);

      const { data: recentDeal } = await supabase
        .from('deal_transcripts')
        .select(
          'id, title, call_date, created_at, auto_linked, match_type, listing:listings(title)',
        )
        .eq('source', 'fireflies')
        .order('created_at', { ascending: false })
        .limit(5);

      return {
        recentBuyer: recentBuyer || [],
        recentDeal: recentDeal || [],
      };
    },
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function FirefliesIntegrationPage() {
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useFirefliesStats();
  const { data: recent, isLoading: recentLoading } = useRecentPairings();
  const { loading: autoPairLoading, result: autoPairResult, runAutoPair } = useFirefliesAutoPair();
  const { loading: bulkSyncLoading, result: bulkSyncResult, runBulkSync } = useFirefliesBulkSync();

  const handleAutoPair = async () => {
    await runAutoPair();
    refetchStats();
  };

  const handleBulkSync = async () => {
    await runBulkSync();
    refetchStats();
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Phone className="h-6 w-6" />
            Fireflies Integration
          </h1>
          <p className="text-muted-foreground">
            Automatically pair Fireflies call transcripts with buyers and deals
          </p>
        </div>
      </div>

      {/* Auto-Pair Action Card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Auto-Pair Transcripts
          </CardTitle>
          <CardDescription>
            Fetches all recent Fireflies transcripts and automatically matches them to buyers and
            deals. Uses contact email for precise matching, then falls back to company/buyer name
            search.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Button size="lg" disabled={autoPairLoading} onClick={handleAutoPair} className="gap-2">
              {autoPairLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {autoPairLoading ? 'Syncing Fireflies...' : 'Sync All Transcripts'}
            </Button>
            {stats && (
              <p className="text-sm text-muted-foreground">
                {stats.buyersWithEmail} buyer{stats.buyersWithEmail !== 1 ? 's' : ''} with contact
                emails available for matching
              </p>
            )}
          </div>

          {/* Last sync result */}
          {autoPairResult && (
            <div className="rounded-lg border bg-background p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Sync Complete
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Transcripts scanned</span>
                  <p className="font-medium">{autoPairResult.transcripts_processed}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Buyer links created</span>
                  <p className="font-medium text-green-600">+{autoPairResult.buyers_paired}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Deal links created</span>
                  <p className="font-medium text-green-600">+{autoPairResult.deals_paired}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Already linked</span>
                  <p className="font-medium text-muted-foreground">
                    {autoPairResult.buyers_skipped + autoPairResult.deals_skipped}
                  </p>
                </div>
              </div>
              {autoPairResult.errors && autoPairResult.errors.length > 0 && (
                <p className="text-xs text-amber-600">
                  {autoPairResult.errors.length} error
                  {autoPairResult.errors.length !== 1 ? 's' : ''} occurred
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk Sync — Pull ALL Fireflies Ever */}
      <Card className="border-orange-500/20 bg-orange-500/5">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Download className="h-5 w-5" />
            Pull All Fireflies Calls Ever
          </CardTitle>
          <CardDescription>
            Fetches <strong>every</strong> transcript from your Fireflies account (no limit), pairs
            them to buyers and deals, and downloads the full transcript content. This may take
            several minutes depending on how many calls you have.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Button
              size="lg"
              variant="outline"
              disabled={bulkSyncLoading || autoPairLoading}
              onClick={handleBulkSync}
              className="gap-2 border-orange-500/30 hover:bg-orange-500/10"
            >
              {bulkSyncLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {bulkSyncLoading ? 'Pulling all Fireflies...' : 'Sync ALL Transcripts + Content'}
            </Button>
            {bulkSyncLoading && (
              <p className="text-sm text-muted-foreground">
                This can take a few minutes — hang tight
              </p>
            )}
          </div>

          {bulkSyncResult && (
            <div className="rounded-lg border bg-background p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Bulk Sync Complete
                {bulkSyncResult.elapsed_seconds && (
                  <span className="text-muted-foreground font-normal">
                    ({bulkSyncResult.elapsed_seconds}s)
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Total in Fireflies</span>
                  <p className="font-medium">{bulkSyncResult.fireflies_total}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Buyer links created</span>
                  <p className="font-medium text-green-600">
                    +{bulkSyncResult.pairing.buyers_paired}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Deal links created</span>
                  <p className="font-medium text-green-600">
                    +{bulkSyncResult.pairing.deals_paired}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Unmatched</span>
                  <p className="font-medium text-muted-foreground">
                    {bulkSyncResult.pairing.unmatched}
                  </p>
                </div>
              </div>
              {typeof bulkSyncResult.content === 'object' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm pt-2 border-t">
                  <div>
                    <span className="text-muted-foreground">Content downloaded</span>
                    <p className="font-medium text-green-600">{bulkSyncResult.content.fetched}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Empty/silent</span>
                    <p className="font-medium text-muted-foreground">
                      {bulkSyncResult.content.skipped_empty}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Failed</span>
                    <p className="font-medium text-red-600">{bulkSyncResult.content.failed}</p>
                  </div>
                </div>
              )}
              {bulkSyncResult.errors && bulkSyncResult.errors.length > 0 && (
                <p className="text-xs text-amber-600">
                  {bulkSyncResult.errors.length} error
                  {bulkSyncResult.errors.length !== 1 ? 's' : ''} occurred
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Buyer Transcripts"
          icon={<Users className="h-4 w-4" />}
          loading={statsLoading}
          value={stats?.buyerTranscriptCount ?? 0}
          subtitle={`${stats?.buyersWithTranscripts ?? 0} of ${stats?.totalBuyers ?? 0} buyers linked`}
        />
        <StatCard
          title="Deal Transcripts"
          icon={<Building2 className="h-4 w-4" />}
          loading={statsLoading}
          value={stats?.dealFirefliesCount ?? 0}
          subtitle={`${stats?.dealsWithTranscripts ?? 0} of ${stats?.totalDeals ?? 0} deals linked`}
        />
        <StatCard
          title="Auto-Linked"
          icon={<RefreshCw className="h-4 w-4" />}
          loading={statsLoading}
          value={stats?.autoLinkedCount ?? 0}
          subtitle="Deal transcripts auto-paired"
        />
        <StatCard
          title="Buyers with Email"
          icon={<FileText className="h-4 w-4" />}
          loading={statsLoading}
          value={stats?.buyersWithEmail ?? 0}
          subtitle={`of ${stats?.totalBuyers ?? 0} total buyers`}
        />
      </div>

      {/* Recent Pairings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent buyer transcript links */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4" />
              Recent Buyer Transcript Links
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : recent?.recentBuyer.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No buyer transcripts linked yet
              </p>
            ) : (
              <div className="space-y-2">
                {recent?.recentBuyer.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{t.title || 'Untitled'}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {(t.buyer as { company_name: string } | null)?.company_name ||
                          'Unknown buyer'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 ml-2">
                      <Clock className="h-3 w-3" />
                      {t.call_date
                        ? new Date(t.call_date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })
                        : new Date(t.created_at!).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent deal transcript links */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Recent Deal Transcript Links
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : recent?.recentDeal.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No deal transcripts linked yet
              </p>
            ) : (
              <div className="space-y-2">
                {recent?.recentDeal.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{t.title || 'Untitled'}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {(t.listing as { title: string } | null)?.title || 'Unknown deal'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {t.auto_linked && (
                        <Badge variant="outline" className="text-[10px] h-4">
                          auto
                        </Badge>
                      )}
                      {t.match_type && (
                        <Badge
                          variant="outline"
                          className={`text-[10px] h-4 ${t.match_type === 'email' ? 'text-green-600 border-green-300' : 'text-blue-600 border-blue-300'}`}
                        >
                          {t.match_type}
                        </Badge>
                      )}
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {t.call_date
                          ? new Date(t.call_date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })
                          : new Date(t.created_at!).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* How it works */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">How Auto-Pairing Works</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
            <li>
              <strong>Quick Sync</strong> fetches up to 500 recent transcripts.
              <strong> Bulk Sync</strong> fetches every transcript in the account (no limit) and
              also downloads the full call content.
            </li>
            <li>
              For each transcript, extracts external participant emails (filters out internal
              @sourcecodeals.com / @captarget.com)
            </li>
            <li>
              <strong>Email match:</strong> Looks up participant emails in buyer contacts and deal
              contact emails for direct matches
            </li>
            <li>
              <strong>Name match (fallback):</strong> If no email match, fuzzy-matches the
              transcript title against buyer company names and deal titles
            </li>
            <li>
              Links matches into the buyer_transcripts and deal_transcripts tables, skipping any
              already linked
            </li>
            <li>
              <strong>Bulk Sync only:</strong> Downloads full transcript text (speaker-labeled
              sentences) for all matched deal transcripts and caches it in the database for chatbot
              search
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat card helper
// ---------------------------------------------------------------------------

function StatCard({
  title,
  icon,
  loading,
  value,
  subtitle,
}: {
  title: string;
  icon: React.ReactNode;
  loading: boolean;
  value: number;
  subtitle: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          {icon}
          {title}
        </div>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <p className="text-2xl font-bold">{value}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      </CardContent>
    </Card>
  );
}
