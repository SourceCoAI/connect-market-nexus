import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2 } from 'lucide-react';
import { BuyerOption } from './types';

interface BuyerPickerProps {
  buyerSearch: string;
  setBuyerSearch: (value: string) => void;
  searchBuyers: (query: string) => void;
  searching: boolean;
  buyerResults: BuyerOption[];
  selectedBuyer: BuyerOption | null;
  selectBuyer: (buyer: BuyerOption) => void;
  clearBuyer: () => void;
  bulkIds: string;
  setBulkIds: (value: string) => void;
}

export function BuyerPicker({
  buyerSearch,
  setBuyerSearch,
  searchBuyers,
  searching,
  buyerResults,
  selectedBuyer,
  selectBuyer,
  clearBuyer,
  bulkIds,
  setBulkIds,
}: BuyerPickerProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Buyer Selection</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by company name..."
              value={buyerSearch}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setBuyerSearch(e.target.value);
                searchBuyers(e.target.value);
              }}
              className="pl-9"
            />
          </div>
          {searching && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mt-2" />}
        </div>

        {buyerResults.length > 0 && !selectedBuyer && (
          <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
            {buyerResults.map((b: BuyerOption) => (
              <button
                key={b.id}
                className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex justify-between items-center"
                onClick={() => selectBuyer(b)}
              >
                <span className="font-medium">{b.company_name}</span>
                <span className="text-muted-foreground text-xs">
                  {b.buyer_type || 'corporate'}
                  {b.pe_firm_name ? ` / ${b.pe_firm_name}` : ''}
                </span>
              </button>
            ))}
          </div>
        )}

        {selectedBuyer && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {selectedBuyer.company_name} ({selectedBuyer.buyer_type || 'corporate'})
              {selectedBuyer.pe_firm_name ? ` / ${selectedBuyer.pe_firm_name}` : ''}
            </Badge>
            <Button variant="ghost" size="sm" onClick={clearBuyer}>
              Clear
            </Button>
          </div>
        )}

        <div className="pt-2 border-t">
          <label className="text-sm text-muted-foreground block mb-1">
            Bulk buyer IDs (comma-separated, for Suite 7)
          </label>
          <Input
            placeholder="uuid1, uuid2, uuid3..."
            value={bulkIds}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBulkIds(e.target.value)}
            className="font-mono text-xs"
          />
        </div>
      </CardContent>
    </Card>
  );
}
