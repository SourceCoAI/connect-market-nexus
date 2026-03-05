import type { LandingPageDeal } from '@/hooks/useDealLandingPage';

interface MetricBox {
  label: string;
  value: string;
  subtitle: string;
}

function formatCurrency(value: number | null | undefined): string {
  if (!value) return '—';
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

/**
 * Mirrors the EnhancedFinancialGrid metric logic from ListingDetail.tsx
 * to keep the landing page metrics identical to the listing page.
 */
function buildMetrics(deal: LandingPageDeal): MetricBox[] {
  const metrics: MetricBox[] = [];

  // Metric 1: Revenue — matches listing page revenue metric
  const revenueYear = new Date().getFullYear() - 1;
  metrics.push({
    label: `${revenueYear} Revenue`,
    value: formatCurrency(deal.revenue),
    subtitle: deal.revenue_metric_subtitle || deal.category || deal.categories?.[0] || '',
  });

  // Metric 2: EBITDA — matches listing page
  const marginPct =
    deal.revenue && deal.revenue > 0 && deal.ebitda
      ? ((deal.ebitda / deal.revenue) * 100).toFixed(1)
      : '0';
  metrics.push({
    label: 'EBITDA',
    value: formatCurrency(deal.ebitda),
    subtitle: deal.ebitda_metric_subtitle || `~${marginPct}% margin profile`,
  });

  // Metric 3: Custom or Team Size — matches listing page logic
  if (deal.metric_3_type === 'custom' && deal.metric_3_custom_label) {
    metrics.push({
      label: deal.metric_3_custom_label,
      value: deal.metric_3_custom_value || '',
      subtitle: deal.metric_3_custom_subtitle || '',
    });
  } else {
    const ft = deal.full_time_employees || 0;
    const pt = deal.part_time_employees || 0;
    metrics.push({
      label: 'Team Size',
      value: `${ft + pt}`,
      subtitle: `${ft} FT, ${pt} PT`,
    });
  }

  // Metric 4: Custom or EBITDA Margin — matches listing page logic
  if (deal.metric_4_type === 'custom' && deal.metric_4_custom_label) {
    metrics.push({
      label: deal.metric_4_custom_label,
      value: deal.metric_4_custom_value || '',
      subtitle: deal.metric_4_custom_subtitle || '',
    });
  } else {
    metrics.push({
      label: 'EBITDA Margin',
      value:
        deal.revenue && deal.revenue > 0 && deal.ebitda
          ? `${((deal.ebitda / deal.revenue) * 100).toFixed(1)}%`
          : '0%',
      subtitle: deal.metric_4_custom_subtitle || 'Profitability metric',
    });
  }

  return metrics;
}

interface MetricsStripProps {
  deal: LandingPageDeal;
}

export default function MetricsStrip({ deal }: MetricsStripProps) {
  const metrics = buildMetrics(deal);

  if (metrics.length === 0) return null;

  return (
    <section className="pb-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 border-b border-[#E5E7EB] pb-6">
        {metrics.map((metric, i) => (
          <div key={i} className="space-y-1">
            <p className="text-xs font-medium text-[#6B7280] uppercase tracking-wider font-['Inter',system-ui,sans-serif]">
              {metric.label}
            </p>
            <p className="text-2xl font-light text-[#1A1A1A] font-['Inter',system-ui,sans-serif]">
              {metric.value}
            </p>
            {metric.subtitle && (
              <p className="text-xs text-[#6B7280] font-['Inter',system-ui,sans-serif]">
                {metric.subtitle}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
