import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { useMemo } from 'react';
import { Users, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import BuyerTableRow from './BuyerTableRow';
import { PAGE_SIZE } from './constants';
import type { BuyerTab } from './constants';
import { useEntityTaskCounts } from '@/hooks/useEntityTasks';

interface BuyerRecord {
  id: string;
  company_name: string;
  [key: string]: unknown;
}

interface BuyersTableProps {
  activeTab: BuyerTab;
  buyersLoading: boolean;
  filteredBuyers: unknown[];
  pagedBuyers: unknown[];
  currentPage: number;
  selectedIds: Set<string>;
  buyers: unknown[] | undefined;
  platformCountsByFirm: Map<string, number>;
  buyerIdsWithTranscripts: Set<string> | undefined;
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
  toggleSelect: (
    id: string,
    checked: boolean,
    event?: React.MouseEvent | React.KeyboardEvent,
  ) => void;
  toggleSelectAll: () => void;
  handleSort: (column: string) => void;
  handleEnrichBuyer: (e: React.MouseEvent, buyerId: string) => void;
  deleteMutation: { mutate: (id: string) => void };
}

const SortIcon = ({
  column,
  sortColumn,
  sortDirection,
}: {
  column: string;
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
}) => {
  if (sortColumn !== column) return <ArrowUpDown className="h-3.5 w-3.5 ml-1 opacity-40" />;
  return sortDirection === 'asc' ? (
    <ArrowUp className="h-3.5 w-3.5 ml-1" />
  ) : (
    <ArrowDown className="h-3.5 w-3.5 ml-1" />
  );
};

const BuyersTable = ({
  activeTab,
  buyersLoading,
  filteredBuyers,
  pagedBuyers,
  currentPage,
  selectedIds,
  buyers,
  platformCountsByFirm,
  buyerIdsWithTranscripts,
  sortColumn,
  sortDirection,
  toggleSelect,
  toggleSelectAll,
  handleSort,
  handleEnrichBuyer,
  deleteMutation,
}: BuyersTableProps) => {
  // Batch-fetch open task counts for the current page of buyers
  const pagedBuyerIds = useMemo(
    () => pagedBuyers.map((b) => (b as BuyerRecord).id),
    [pagedBuyers],
  );
  const { data: buyerTaskCounts } = useEntityTaskCounts('buyer', pagedBuyerIds);

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={filteredBuyers.length > 0 && selectedIds.size === filteredBuyers.length}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead className="w-[48px] text-muted-foreground text-xs font-normal">
                #
              </TableHead>
              <TableHead
                className="w-[260px] cursor-pointer select-none hover:bg-muted/50"
                onClick={() => handleSort('company_name')}
              >
                <span className="flex items-center">
                  {activeTab === 'private_equity' ? 'Firm Name' : 'Platform / Buyer'}
                  <SortIcon
                    column="company_name"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                  />
                </span>
              </TableHead>
              {activeTab === 'private_equity' ? (
                <>
                  <TableHead className="w-[140px]">Type</TableHead>
                  <TableHead className="w-[110px] text-center">Platforms</TableHead>
                  <TableHead className="w-[70px] text-center">Fee Agmt</TableHead>
                  <TableHead className="w-[60px] text-center">NDA</TableHead>
                  <TableHead className="w-[70px] text-center">Mktpl.</TableHead>
                  <TableHead className="w-[130px]">Intel</TableHead>
                </>
              ) : (
                <>
                  <TableHead
                    className="w-[180px] cursor-pointer select-none hover:bg-muted/50"
                    onClick={() => handleSort('pe_firm_name')}
                  >
                    <span className="flex items-center">
                      PE Firm{' '}
                      <SortIcon
                        column="pe_firm_name"
                        sortColumn={sortColumn}
                        sortDirection={sortDirection}
                      />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none hover:bg-muted/50"
                    onClick={() => handleSort('universe')}
                  >
                    <span className="flex items-center">
                      Universe{' '}
                      <SortIcon
                        column="universe"
                        sortColumn={sortColumn}
                        sortDirection={sortDirection}
                      />
                    </span>
                  </TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[70px] text-center">Mktpl.</TableHead>
                  <TableHead className="w-[70px] text-center">Fee Agmt</TableHead>
                  <TableHead className="w-[60px] text-center">NDA</TableHead>
                  <TableHead className="w-[130px]">Intel</TableHead>
                </>
              )}
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {buyersLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-4" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-6" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-10 w-48" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-48" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-8" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-8" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-8" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-8 w-8" />
                  </TableCell>
                </TableRow>
              ))
            ) : filteredBuyers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="text-center py-12 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-3 opacity-50" />
                  <p className="font-medium">No buyers found</p>
                  <p className="text-sm">Add buyers manually or import from CSV</p>
                </TableCell>
              </TableRow>
            ) : (
              pagedBuyers.map((buyer: unknown, pageIdx: number) => {
                const b = buyer as BuyerRecord;
                const globalIdx = (currentPage - 1) * PAGE_SIZE + pageIdx + 1;
                return (
                  <BuyerTableRow
                    key={b.id}
                    buyer={b}
                    globalIdx={globalIdx}
                    activeTab={activeTab}
                    selectedIds={selectedIds}
                    buyers={buyers}
                    platformCountsByFirm={platformCountsByFirm}
                    buyerIdsWithTranscripts={buyerIdsWithTranscripts}
                    pendingTaskCount={buyerTaskCounts?.get(b.id) || 0}
                    toggleSelect={toggleSelect}
                    handleEnrichBuyer={handleEnrichBuyer}
                    deleteMutation={deleteMutation}
                  />
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default BuyersTable;
