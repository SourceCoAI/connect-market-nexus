import { Button } from "@/components/ui/button";
import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from "lucide-react";

interface SourceCoPaginationProps {
  filteredCount: number;
  totalDeals: number;
  safePage: number;
  totalPages: number;
  PAGE_SIZE: number;
  setCurrentPage: (page: number | ((p: number) => number)) => void;
}

export function SourceCoPagination({
  filteredCount, totalDeals, safePage, totalPages, PAGE_SIZE, setCurrentPage,
}: SourceCoPaginationProps) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-xs text-muted-foreground">
        Showing {filteredCount > 0 ? (safePage - 1) * PAGE_SIZE + 1 : 0}&ndash;{Math.min(safePage * PAGE_SIZE, filteredCount)} of {filteredCount} deals
        {filteredCount !== totalDeals && ` (filtered from ${totalDeals})`}
      </p>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(1)} disabled={safePage <= 1}>
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage((p: number) => Math.max(1, p - 1))} disabled={safePage <= 1}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm px-3 tabular-nums flex items-center gap-1">
          Page
          <input
            type="number"
            min={1}
            max={totalPages}
            value={safePage}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val) && val >= 1 && val <= totalPages) setCurrentPage(val);
            }}
            className="w-12 h-7 text-center text-sm border border-input rounded-md bg-background tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          of {totalPages}
        </span>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage((p: number) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(totalPages)} disabled={safePage >= totalPages}>
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
