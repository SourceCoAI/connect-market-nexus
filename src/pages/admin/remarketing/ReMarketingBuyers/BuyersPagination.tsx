import { Button } from '@/components/ui/button';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { PAGE_SIZE } from './constants';

interface BuyersPaginationProps {
  filteredCount: number;
  totalBuyers: number;
  currentPage: number;
  totalPages: number;
  setCurrentPage: (page: number | ((p: number) => number)) => void;
}

export function BuyersPagination({
  filteredCount,
  totalBuyers,
  currentPage,
  totalPages,
  setCurrentPage,
}: BuyersPaginationProps) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-xs text-muted-foreground">
        Showing {filteredCount > 0 ? (currentPage - 1) * PAGE_SIZE + 1 : 0}
        &ndash;
        {Math.min(currentPage * PAGE_SIZE, filteredCount)} of {filteredCount}{' '}
        buyers
        {filteredCount !== totalBuyers && ` (filtered from ${totalBuyers})`}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => setCurrentPage(1)}
          disabled={currentPage <= 1}
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => setCurrentPage((p: number) => Math.max(1, p - 1))}
          disabled={currentPage <= 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm px-3 tabular-nums flex items-center gap-1">
          Page
          <input
            type="number"
            min={1}
            max={totalPages}
            value={currentPage}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val) && val >= 1 && val <= totalPages)
                setCurrentPage(val);
            }}
            className="w-12 h-7 text-center text-sm border border-input rounded-md bg-background tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          of {totalPages}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() =>
            setCurrentPage((p: number) => Math.min(totalPages, p + 1))
          }
          disabled={currentPage >= totalPages}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => setCurrentPage(totalPages)}
          disabled={currentPage >= totalPages}
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
