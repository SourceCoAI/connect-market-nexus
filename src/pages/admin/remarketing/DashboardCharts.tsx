/**
 * DashboardCharts.tsx
 *
 * SVG line chart for weekly deals added, used on the ReMarketing Dashboard.
 *
 * Extracted from ReMarketingDashboard.tsx for maintainability.
 */
import { formatWeekLabel } from './useDashboardData';

interface WeeklyChartProps {
  weeklyData: Record<string, number>;
}

export const WeeklyChart = ({ weeklyData }: WeeklyChartProps) => {
  const weeks = Object.entries(weeklyData).sort(([a], [b]) => a.localeCompare(b));

  if (weeks.length === 0) {
    return <div className="text-center py-10 text-gray-400 text-sm">No data for chart</div>;
  }

  const values = weeks.map(([, v]) => v);
  const max = Math.max(...values, 1);
  const total = values.reduce((s, v) => s + v, 0);

  const W = 440;
  const H = 160;
  const PL = 30;
  const PR = 10;
  const PT = 25;
  const PB = 30;
  const chartW = W - PL - PR;
  const chartH = H - PT - PB;

  const points = values.map((v, i) => ({
    x: PL + (i / (values.length - 1 || 1)) * chartW,
    y: PT + chartH - (v / max) * chartH,
    v,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1]?.x ?? PL},${PT + chartH} L${PL},${PT + chartH} Z`;

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((pct) => ({
    y: PT + chartH - pct * chartH,
    label: Math.round(pct * max),
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
          Opportunities Added to Active Opportunities
        </h3>
        <span className="text-xs text-gray-400">{total} total (8 weeks)</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#2563eb" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {gridLines.map((g) => (
          <g key={g.y}>
            <line x1={PL} y1={g.y} x2={W - PR} y2={g.y} stroke="#f1f5f9" strokeWidth="1" />
            <text x={PL - 4} y={g.y + 3} textAnchor="end" className="fill-gray-400" fontSize="8">
              {g.label}
            </text>
          </g>
        ))}
        <path d={areaPath} fill="url(#chartGrad)" />
        <path
          d={linePath}
          fill="none"
          stroke="#2563eb"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <g key={`point-${p.x}-${p.y}`}>
            <circle cx={p.x} cy={p.y} r="4" fill="white" stroke="#2563eb" strokeWidth="2" />
            <text
              x={p.x}
              y={p.y - 8}
              textAnchor="middle"
              className="fill-gray-700 font-medium"
              fontSize="9"
            >
              {p.v}
            </text>
            <text
              x={p.x}
              y={PT + chartH + 14}
              textAnchor="middle"
              className="fill-gray-400"
              fontSize="8"
            >
              {formatWeekLabel(weeks[i][0])}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
};
