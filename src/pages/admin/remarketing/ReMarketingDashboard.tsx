/**
 * ReMarketingDashboard.tsx
 *
 * Main dashboard layout for the ReMarketing module. Orchestrates data fetching,
 * filters, charts, and metric panels. Heavy lifting is delegated to:
 *   - useDashboardData  -- all queries and derived metrics
 *   - DashboardFilters  -- timeframe selector
 *   - DashboardCharts   -- SVG line chart
 */
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { DealSourceBadge } from '@/components/remarketing/DealSourceBadge';
import { useAdminProfiles } from '@/hooks/admin/use-admin-profiles';
import { formatDistanceToNow } from 'date-fns';
import { BarChart3, ArrowUpRight, Zap, Clock } from 'lucide-react';

import { DashboardFilters } from './DashboardFilters';
import { WeeklyChart } from './DashboardCharts';
import {
  useDashboardData,
  formatCurrency,
  scorePillClass,
  initials,
  SOURCE_COLORS,
  SOURCE_LABELS,
  type Timeframe,
} from './useDashboardData';

const ReMarketingDashboard = () => {
  const [timeframe, setTimeframe] = useState<Timeframe>('30d');
  const { data: adminProfiles } = useAdminProfiles();

  const {
    loading,
    universesLoading,
    cards,
    newBySource,
    allBySource,
    teamData,
    topDeals,
    weeklyData,
    recentActivity,
    scoreBuckets,
    universeMetrics,
  } = useDashboardData(timeframe);

  return (
    <div className="p-6 space-y-5 bg-gray-50/50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Remarketing Dashboard</h1>
          <p className="text-sm text-muted-foreground">Deal pipeline overview</p>
        </div>
        <DashboardFilters timeframe={timeframe} onTimeframeChange={setTimeframe} />
      </div>

      {/* ROW 1: Headline Metric Cards */}
      {loading ? (
        <div className="grid gap-3 md:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        cards && (
          <div className="grid gap-3 md:grid-cols-5">
            <div className="rounded-xl border bg-gray-900 text-white px-4 py-3.5">
              <p className="text-[10px] uppercase tracking-widest text-gray-400">Active Deals</p>
              <p className="text-2xl font-bold mt-1">{cards.all_visible}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                +{cards.all_new_in_period} in period
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3.5">
              <p className="text-[10px] uppercase tracking-widest text-gray-500">CapTarget</p>
              <p className="text-2xl font-bold mt-1">{cards.ct_total}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                +{cards.ct_new} new · {cards.ct_pushed} pushed
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3.5">
              <p className="text-[10px] uppercase tracking-widest text-gray-500">GP Partners</p>
              <p className="text-2xl font-bold mt-1">{cards.gp_total}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                +{cards.gp_new} new · {cards.gp_pushed} pushed
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3.5">
              <p className="text-[10px] uppercase tracking-widest text-gray-500">
                Referral / Other
              </p>
              <p className="text-2xl font-bold mt-1">{cards.other_total}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {cards.marketplace_total} marketplace · {cards.manual_total} manual
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3.5">
              <p className="text-[10px] uppercase tracking-widest text-gray-500">Enriched</p>
              <p className="text-2xl font-bold mt-1">{cards.enriched}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {cards.pending_enrichment} pending · {cards.failed_enrichment} failed
              </p>
            </div>
          </div>
        )
      )}

      {/* ROW 2: Weekly Chart + CT + GP */}
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <WeeklyChart weeklyData={weeklyData as Record<string, number>} />
          )}
        </div>

        {/* CapTarget panel */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700 mb-4">
            CapTarget
          </h3>
          {loading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            cards && (
              <>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-2xl font-bold text-blue-600">{cards.ct_new}</p>
                    <p className="text-[10px] text-gray-500 uppercase">New Deals</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-600">
                      {cards.ct_approved_in_period}
                    </p>
                    <p className="text-[10px] text-gray-500 uppercase">Approved</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-800">{cards.ct_avg}</p>
                    <p className="text-[10px] text-gray-500 uppercase">Avg Score</p>
                  </div>
                </div>
                <div className="border-t mt-4 pt-3 flex items-center justify-between text-xs text-gray-500">
                  <span>{cards.ct_total} total CapTarget deals</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${scorePillClass(cards.ct_avg)}`}
                  >
                    {cards.ct_avg}
                  </span>
                </div>
              </>
            )
          )}
        </div>

        {/* GP Partners panel */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700 mb-4">
            GP Partners
          </h3>
          {loading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            cards && (
              <>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-2xl font-bold text-orange-600">{cards.gp_new}</p>
                    <p className="text-[10px] text-gray-500 uppercase">New Deals</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-600">
                      {cards.gp_approved_in_period}
                    </p>
                    <p className="text-[10px] text-gray-500 uppercase">Approved</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-800">{cards.gp_avg}</p>
                    <p className="text-[10px] text-gray-500 uppercase">Avg Score</p>
                  </div>
                </div>
                <div className="border-t mt-4 pt-3 flex items-center justify-between text-xs text-gray-500">
                  <span>{cards.gp_total} total GP Partners deals</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${scorePillClass(cards.gp_avg)}`}
                  >
                    {cards.gp_avg}
                  </span>
                </div>
              </>
            )
          )}
        </div>
      </div>

      {/* ROW 3: New by Source + Team Assignments */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* New Deals by Source */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
              New Deals by Source
            </h3>
            <span className="text-xs text-gray-400">
              {loading
                ? '...'
                : Object.values(newBySource as Record<string, number>).reduce(
                    (a: number, b: number) => a + b,
                    0,
                  )}{' '}
              added
            </span>
          </div>
          {loading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            (() => {
              const entries = Object.entries(newBySource as Record<string, number>).sort(
                ([, a], [, b]) => b - a,
              );
              const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
              return (
                <div>
                  <div className="flex h-3 rounded-full overflow-hidden bg-gray-100 mb-4">
                    {entries.map(([src, count]) => (
                      <div
                        key={src}
                        style={{
                          width: `${(count / total) * 100}%`,
                          backgroundColor: SOURCE_COLORS[src] || '#94a3b8',
                        }}
                      />
                    ))}
                  </div>
                  <div className="space-y-2">
                    {entries.map(([src, count]) => (
                      <div key={src} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: SOURCE_COLORS[src] || '#94a3b8' }}
                          />
                          <span className="text-gray-700">{SOURCE_LABELS[src] || src}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500 text-xs">
                            {Math.round((count / total) * 100)}%
                          </span>
                          <span className="font-medium w-8 text-right">{count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()
          )}
        </div>

        {/* Team Assignments */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
              Team Assignments
            </h3>
            <span className="text-xs text-gray-400">{cards?.all_visible || 0} deals</span>
          </div>
          {loading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            (() => {
              const entries = teamData.sort((a, b) => {
                if (a.owner_id === '__unassigned') return 1;
                if (b.owner_id === '__unassigned') return -1;
                return (b.total as number) - (a.total as number);
              });
              return (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {entries.map((item: any) => {
                    const oid = item.owner_id;
                    const profile =
                      oid !== '__unassigned' && adminProfiles ? adminProfiles[oid] : null;
                    const name = profile ? profile.displayName : 'Unassigned';
                    const fi = profile ? initials(profile.first_name, profile.last_name) : '?';
                    return (
                      <div key={oid} className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${oid === '__unassigned' ? 'bg-gray-200 text-gray-500' : 'bg-blue-100 text-blue-700'}`}
                        >
                          {fi}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{name}</p>
                          <p className="text-[11px] text-gray-500">
                            {item.enriched} enriched · {item.scored} scored
                          </p>
                        </div>
                        <span className="text-sm font-bold text-gray-800">{item.total}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })()
          )}
        </div>
      </div>

      {/* ROW 4: Top Deals */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
            Top Deals Added
          </h3>
          <span className="text-xs text-gray-400">Highest scored in period</span>
        </div>
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : topDeals.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <BarChart3 className="mx-auto h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">No scored deals in this period</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-gray-500 uppercase tracking-wider border-b">
                  <th className="pb-2 pr-2 w-8">#</th>
                  <th className="pb-2 pr-3">Company</th>
                  <th className="pb-2 pr-3">Source</th>
                  <th className="pb-2 pr-3">Category</th>
                  <th className="pb-2 pr-3 text-right">Revenue</th>
                  <th className="pb-2 pr-3 text-right">EBITDA</th>
                  <th className="pb-2 pr-3 text-center">Score</th>
                  <th className="pb-2 pr-3">State</th>
                  <th className="pb-2 text-right">Added</th>
                </tr>
              </thead>
              <tbody>
                {topDeals.map((deal: any, i: number) => (
                  <tr key={deal.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-2.5 pr-2 text-gray-400 font-medium">{i + 1}</td>
                    <td className="py-2.5 pr-3">
                      <Link
                        to={`/admin/deals/${deal.id}`}
                        state={{ from: '/admin' }}
                        className="font-medium text-gray-900 hover:text-blue-600 transition-colors"
                      >
                        {deal.internal_company_name || deal.title || '—'}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-3">
                      <DealSourceBadge source={deal.deal_source} />
                    </td>
                    <td className="py-2.5 pr-3 text-gray-600 truncate max-w-[120px]">
                      {deal.category || '—'}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-gray-700">
                      {formatCurrency(deal.revenue)}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-gray-700">
                      {formatCurrency(deal.ebitda)}
                    </td>
                    <td className="py-2.5 pr-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${scorePillClass(deal.deal_total_score)}`}
                      >
                        {deal.deal_total_score}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-gray-600">{deal.address_state || '—'}</td>
                    <td className="py-2.5 text-right text-gray-500 text-xs">
                      {formatDistanceToNow(new Date(deal.created_at), { addSuffix: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ROW 5: Score Distribution + Universes + Source Breakdown + Activity */}
      <div className="grid gap-4 lg:grid-cols-4">
        {/* Score Distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
              Deals by Score
            </h3>
            <span className="text-xs text-gray-400">{cards?.total_scored || 0} scored</span>
          </div>
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="space-y-3">
              {scoreBuckets.map((b) => {
                const maxCount = Math.max(...scoreBuckets.map((x) => x.count), 1);
                return (
                  <div key={b.label}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: b.color }}
                        />
                        <span className="text-gray-600">{b.label}</span>
                        <span className="text-gray-400">{b.tag}</span>
                      </div>
                      <span className="font-medium text-gray-800">{b.count}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${(b.count / maxCount) * 100}%`,
                          backgroundColor: b.color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Buyer Universes */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
              Buyer Universes
            </h3>
            <span className="text-xs text-gray-400">{universeMetrics?.length || 0} active</span>
          </div>
          {universesLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : universeMetrics && universeMetrics.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No active universes</p>
          ) : (
            universeMetrics && (
              <div className="space-y-3 max-h-52 overflow-y-auto">
                {universeMetrics.map((u) => (
                  <div
                    key={u.id}
                    className="p-2.5 rounded-lg border border-gray-100 hover:bg-gray-50/50"
                  >
                    <div className="flex items-center justify-between">
                      <Link
                        to={`/admin/buyers/universes/${u.id}`}
                        className="text-sm font-medium text-gray-800 hover:text-blue-600 truncate"
                      >
                        {u.name}
                      </Link>
                      <span className="text-xs text-gray-500 shrink-0 ml-2">{u.buyers} buyers</span>
                    </div>
                    <div className="flex gap-2 mt-1.5">
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 bg-blue-50 text-blue-700 border-blue-200"
                      >
                        {u.totalScored} scored
                      </Badge>
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 bg-green-50 text-green-700 border-green-200"
                      >
                        {u.approved} approved
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* All Deals by Source */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
              Active Deals by Source
            </h3>
            <span className="text-xs text-gray-400">{cards?.all_visible || 0} total</span>
          </div>
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            (() => {
              const entries = Object.entries(allBySource as Record<string, number>).sort(
                ([, a], [, b]) => b - a,
              );
              const maxCount = Math.max(...entries.map(([, v]) => v), 1);
              return (
                <div>
                  <div className="space-y-2.5">
                    {entries.map(([src, count]) => (
                      <div key={src}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: SOURCE_COLORS[src] || '#94a3b8' }}
                            />
                            <span className="text-gray-700">{SOURCE_LABELS[src] || src}</span>
                          </div>
                          <span className="font-medium">{count}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(count / maxCount) * 100}%`,
                              backgroundColor: SOURCE_COLORS[src] || '#94a3b8',
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Enrichment sub-section */}
                  <div className="border-t mt-4 pt-3">
                    <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-2">
                      Enrichment
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 bg-green-50 text-green-700 border-green-200"
                      >
                        {cards?.enriched || 0} Enriched
                      </Badge>
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700 border-amber-200"
                      >
                        {cards?.pending_enrichment || 0} Pending
                      </Badge>
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 bg-red-50 text-red-700 border-red-200"
                      >
                        {cards?.failed_enrichment || 0} Failed
                      </Badge>
                    </div>
                  </div>
                </div>
              );
            })()
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
              Recent Activity
            </h3>
            <Clock className="h-3.5 w-3.5 text-gray-400" />
          </div>
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : recentActivity.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No recent activity</p>
          ) : (
            <div className="space-y-3">
              {recentActivity.map((ev) => {
                const iconColor =
                  ev.type === 'pushed'
                    ? 'bg-green-100 text-green-600'
                    : ev.source === 'captarget'
                      ? 'bg-blue-100 text-blue-600'
                      : ev.source === 'gp_partners'
                        ? 'bg-orange-100 text-orange-600'
                        : ev.source === 'referral'
                          ? 'bg-purple-100 text-purple-600'
                          : 'bg-gray-100 text-gray-600';
                return (
                  <div key={`${ev.name}-${ev.date}`} className="flex items-start gap-2.5">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${iconColor}`}
                    >
                      {ev.type === 'pushed' ? (
                        <ArrowUpRight className="h-3 w-3" />
                      ) : (
                        <Zap className="h-3 w-3" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-800 truncate">
                        {ev.type === 'pushed' ? 'Pushed to Active Deals' : 'Deal created'}:{' '}
                        <span className="font-medium">{String(ev.name)}</span>
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <DealSourceBadge source={String(ev.source)} />
                        <span className="text-[10px] text-gray-400">
                          {formatDistanceToNow(new Date(String(ev.date)), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReMarketingDashboard;
