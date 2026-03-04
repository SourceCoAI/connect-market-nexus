import { Link } from 'react-router-dom';
import { CheckCircle2, AlertCircle } from 'lucide-react';

interface BuyerProfileStatusProps {
  isComplete?: boolean;
  completionPercentage?: number;
}

export function BuyerProfileStatus({
  isComplete = false,
  completionPercentage = 0,
}: BuyerProfileStatusProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {isComplete ? (
            <>
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span className="text-[12px] text-[#0E101A]/60">Complete</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-3 h-3 text-[#DEC76B]" />
              <span className="text-[12px] text-[#0E101A]/60">Incomplete</span>
            </>
          )}
        </div>
      </div>

      {!isComplete && completionPercentage > 0 && (
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-[#0E101A]/40">Profile completeness</span>
            <span className="font-mono text-[11px] text-[#0E101A]/70">{completionPercentage}%</span>
          </div>
          <div className="h-1 bg-[#F0EDE6] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#0E101A] transition-all duration-300"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
        </div>
      )}

      <Link
        to="/profile"
        className="inline-flex items-center gap-1 text-[12px] text-[#0E101A] font-medium hover:text-[#0E101A]/60 transition-colors duration-200 group"
      >
        <span>Review profile</span>
        <span className="transform group-hover:translate-x-0.5 transition-transform duration-200">
          →
        </span>
      </Link>
    </div>
  );
}
