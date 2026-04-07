import { memo } from "react";
import { XCircle } from "lucide-react";
import { Link } from "react-router-dom";

interface ListingCardTitleProps {
  title: string;
  connectionExists?: boolean;
  connectionStatus?: string;
  viewType?: "grid" | "list";
  requestId?: string;
}

const ListingCardTitle = memo(function ListingCardTitle({
  title,
  connectionExists = false,
  connectionStatus = "",
  viewType = "grid",
  requestId
}: ListingCardTitleProps) {
  const getStatusIndicator = () => {
    if (!connectionExists) return null;

    switch (connectionStatus) {
      case "pending":
        return (
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-br from-[#F8F6F1] to-[#F5F1E8] border border-[#E8E3D5] shadow-sm">
              {/* Custom Clock Icon */}
              <svg 
                width="14" 
                height="14" 
                viewBox="0 0 14 14" 
                fill="none" 
                xmlns="http://www.w3.org/2000/svg"
                className="flex-shrink-0"
              >
                <circle 
                  cx="7" 
                  cy="7" 
                  r="6" 
                  stroke="#8B7355" 
                  strokeWidth="1.5" 
                  fill="none"
                />
                <path 
                  d="M7 3.5V7L9.5 9.5" 
                  stroke="#8B7355" 
                  strokeWidth="1.5" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                />
              </svg>
              <span className="text-[11px] font-semibold text-[#6B5D4F] tracking-[0.03em] uppercase">
                Request Pending
              </span>
            </div>
            <Link
              to={requestId ? `/my-requests?request=${requestId}` : "/my-requests"}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all duration-200 group"
            >
              <svg 
                width="12" 
                height="12" 
                viewBox="0 0 12 12" 
                fill="none" 
                xmlns="http://www.w3.org/2000/svg"
                className="flex-shrink-0"
              >
                <path 
                  d="M2 6H10M10 6L7 3M10 6L7 9" 
                  stroke="#64748B" 
                  strokeWidth="1.5" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                  className="group-hover:stroke-slate-700 transition-colors"
                />
              </svg>
              <span className="text-[10px] font-medium text-slate-600 group-hover:text-slate-900 tracking-wide">
                View Status
              </span>
            </Link>
          </div>
        );
      case "approved":
        // Approved badge is now on the image, not here
        return null;
      case "rejected":
        return (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-br from-red-50 to-red-100/80 border border-red-200 shadow-sm">
            <XCircle className="h-3.5 w-3.5 text-red-600" />
            <span className="text-[11px] font-semibold text-red-700 tracking-[0.03em] uppercase">
              Not Selected
            </span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div>
      <h3 className={`${viewType === "grid" ? "text-[20px]" : "text-[18px]"} font-semibold text-slate-900 tracking-[-0.02em] leading-[1.35] line-clamp-2`}>
        {title}
      </h3>
      {connectionExists && (
        <div className="mt-2.5">
          {getStatusIndicator()}
        </div>
      )}
    </div>
  );
});

export default ListingCardTitle;
