import type { LandingPageDeal } from '@/hooks/useDealLandingPage';

interface MetricBox {
  label: string;
  value: string;
  subtitle: string;
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value >= 1_000_000_000) return `~$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `~$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `~$${(value / 1_000).toFixed(0)}K`;
  return `~$${value.toLocaleString()}`;
}

function buildMetrics(deal: LandingPageDeal): MetricBox[] {
  const metrics: MetricBox[] = [];

  // Metric 1: Revenue
  metrics.push({
    label: 'Annual Revenue',
    value: formatCurrency(deal.revenue),
    subtitle: deal.revenue_metric_subtitle || 'Combined all locations',
  });

  // Metric 2: EBITDA
  const marginPct =
    deal.revenue && deal.revenue > 0 && deal.ebitda
      ? ((deal.ebitda / deal.revenue) * 100).toFixed(0)
      : '0';
  metrics.push({
    label: 'EBITDA / SDE',
    value: formatCurrency(deal.ebitda),
    subtitle: deal.ebitda_metric_subtitle || `${marginPct}% margin profile`,
  });

  // Metric 3: Custom or Transaction Type
  if (deal.metric_3_type === 'custom' && deal.metric_3_custom_label) {
    metrics.push({
      label: deal.metric_3_custom_label,
      value: deal.metric_3_custom_value || '',
      subtitle: deal.metric_3_custom_subtitle || '',
    });
  } else {
    metrics.push({
      label: 'Transaction Type',
      value: '100% Sale',
      subtitle: 'Full equity exit',
    });
  }

  // Metric 4: Custom or EBITDA Margin
  if (deal.metric_4_type === 'custom' && deal.metric_4_custom_label) {
    metrics.push({
      label: deal.metric_4_custom_label,
      value: deal.metric_4_custom_value || '',
      subtitle: deal.metric_4_custom_subtitle || '',
    });
  } else {
    const margin4Pct =
      deal.revenue && deal.revenue > 0 && deal.ebitda
        ? ((deal.ebitda / deal.revenue) * 100).toFixed(1)
        : null;
    metrics.push({
      label: 'EBITDA Margin',
      value: margin4Pct ? `${margin4Pct}%` : '—',
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
    <section
      style={{
        display: 'grid',
        gap: 12,
        margin: '32px 0',
        fontFamily: "'DM Sans', sans-serif",
      }}
      className="animate-[fadeUp_0.5s_0.1s_ease_both] grid-cols-2 lg:grid-cols-4"
    >
      {metrics.map((metric, i) => (
        <div
          key={i}
          style={{
            background: '#FDFCFA',
            border: '1px solid #DDD8D0',
            borderRadius: 10,
            padding: '20px 22px',
            transition: 'transform 0.15s, box-shadow 0.15s',
            cursor: 'default',
          }}
          className="hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(0,0,0,0.06)]"
        >
          <div
            style={{
              fontSize: '10.5px',
              fontWeight: 600,
              letterSpacing: '0.09em',
              textTransform: 'uppercase',
              color: '#6B6560',
              marginBottom: 8,
            }}
          >
            {metric.label}
          </div>
          <div
            style={{
              fontFamily: "'DM Serif Display', serif",
              fontSize: metric.value.length > 10 ? 20 : 28,
              color: '#1A1714',
              letterSpacing: '-0.02em',
              lineHeight: 1,
              marginBottom: 5,
              marginTop: metric.value.length > 10 ? 4 : 0,
            }}
          >
            {metric.value}
          </div>
          {metric.subtitle && (
            <div style={{ fontSize: '11.5px', color: '#B8933A', fontWeight: 500 }}>
              {metric.subtitle}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
