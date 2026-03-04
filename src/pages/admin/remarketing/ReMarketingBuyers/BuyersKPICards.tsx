import { Card, CardContent } from '@/components/ui/card';
import { Users, Building2, FileSignature, AlertCircle } from 'lucide-react';

interface BuyersKPICardsProps {
  totalBuyers: number;
  sponsorCount: number;
  needsAgreements: number;
  needsReview: number;
}

export function BuyersKPICards({
  totalBuyers,
  sponsorCount,
  needsAgreements,
  needsReview,
}: BuyersKPICardsProps) {
  return (
    <div className="grid grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Buyers</p>
              <p className="text-2xl font-bold">{totalBuyers}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Building2 className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Sponsors & Firms</p>
              <p className="text-2xl font-bold text-purple-600">{sponsorCount}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <FileSignature className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Need Agreements</p>
              <p className="text-2xl font-bold text-amber-600">{needsAgreements}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <AlertCircle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Needs Review</p>
              <p className="text-2xl font-bold text-red-600">{needsReview}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
