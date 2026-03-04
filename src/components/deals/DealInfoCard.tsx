/**
 * DealInfoCard — Clean key-value card showing deal metrics.
 */

import { formatCompactCurrency } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface DealInfoCardProps {
  category?: string;
  location?: string;
  revenue?: number;
  ebitda?: number;
  acquisitionType?: string | null;
  createdAt: string;
  description?: string;
}

function InfoRow({ label, value }: { label: string; value: string | undefined | null }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between py-2 border-b border-[#F0EDE6] last:border-0">
      <span className="text-[12px] text-[#0E101A]/40">{label}</span>
      <span className="text-[13px] font-medium text-[#0E101A]/80 text-right">{value}</span>
    </div>
  );
}

export function DealInfoCard({
  category,
  location,
  revenue,
  ebitda,
  acquisitionType,
  createdAt,
  description,
}: DealInfoCardProps) {
  const ebitdaMargin =
    ebitda && revenue && revenue > 0 ? `${((ebitda / revenue) * 100).toFixed(1)}%` : null;

  return (
    <div className="rounded-lg border border-[#F0EDE6] bg-white overflow-hidden">
      {/* Section header */}
      <div className="px-5 py-3 border-b border-[#F0EDE6]">
        <h3 className="text-[10px] font-semibold text-[#0E101A]/30 uppercase tracking-[0.12em]">
          Deal Details
        </h3>
      </div>

      <div className="px-5 py-2">
        <InfoRow label="Category" value={category} />
        <InfoRow label="Location" value={location} />
        <InfoRow label="Revenue" value={revenue ? formatCompactCurrency(revenue) : undefined} />
        <InfoRow label="EBITDA" value={ebitda ? formatCompactCurrency(ebitda) : undefined} />
        <InfoRow label="Margin" value={ebitdaMargin} />
        <InfoRow label="Type" value={acquisitionType} />
        <InfoRow
          label="Submitted"
          value={formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
        />
      </div>

      {/* Description preview */}
      {description && (
        <div className="px-5 py-3 border-t border-[#F0EDE6]">
          <p className="text-[12px] text-[#0E101A]/40 leading-relaxed line-clamp-3">
            {description}
          </p>
        </div>
      )}
    </div>
  );
}
