import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  
  Building2,
  ExternalLink,
  Link2,
  Plus,
  Search,
  Unlink,
  FileCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { BuyerTypeBadge } from '@/components/admin/deals/buyer-introductions/shared/BuyerTypeBadge';

interface BuyerRelationshipSectionProps {
  buyerId: string;
  buyerType: string | null;
  isPeBacked: boolean;
  parentPeFirmId: string | null;
  parentPeFirmName: string | null;
}

export function BuyerRelationshipSection({
  buyerId,
  buyerType,
  isPeBacked,
  parentPeFirmId,
  parentPeFirmName,
}: BuyerRelationshipSectionProps) {
  const queryClient = useQueryClient();
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const isPEFirm = buyerType === 'private_equity';
  const isPlatformCompany = isPeBacked || !!parentPeFirmId;

  // Fetch portfolio companies for PE firms
  const { data: portfolioCompanies = [] } = useQuery({
    queryKey: ['portfolio-companies', buyerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('buyers')
        .select('id, company_name, buyer_type, is_pe_backed, has_fee_agreement, company_website')
        .eq('parent_pe_firm_id', buyerId)
        .eq('archived', false)
        .order('company_name');

      if (error) throw error;
      return data || [];
    },
    enabled: isPEFirm,
  });

  // Search PE firms for linking
  const { data: searchResults = [] } = useQuery({
    queryKey: ['search-pe-firms', searchQuery],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 2) return [];
      const { data, error } = await supabase
        .from('buyers')
        .select('id, company_name, company_website, has_fee_agreement')
        .eq('buyer_type', isPEFirm ? 'corporate' : 'private_equity')
        .eq('archived', false)
        .ilike('company_name', `%${searchQuery}%`)
        .limit(10);

      if (error) return [];
      return data || [];
    },
    enabled: searchModalOpen && searchQuery.length >= 2,
  });

  const handleLink = async (targetId: string) => {
    setIsLinking(true);
    try {
      if (isPEFirm) {
        // PE firm adding a portfolio company
        const { error } = await supabase
          .from('buyers')
          .update({ parent_pe_firm_id: buyerId, is_pe_backed: true })
          .eq('id', targetId);

        if (error) throw error;
        toast.success('Portfolio company linked');
      } else {
        // Platform company setting parent PE firm
        const { error } = await supabase
          .from('buyers')
          .update({ parent_pe_firm_id: targetId, is_pe_backed: true })
          .eq('id', buyerId);

        if (error) throw error;
        toast.success('Parent PE firm linked');
      }

      queryClient.invalidateQueries({ queryKey: ['remarketing', 'buyer', buyerId] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-companies', buyerId] });
      setSearchModalOpen(false);
      setSearchQuery('');
    } catch (error) {
      toast.error('Failed to link: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlink = async (childId: string) => {
    if (!confirm('Removing this link means the company will lose inherited agreement coverage. Continue?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('buyers')
        .update({ parent_pe_firm_id: null, is_pe_backed: false, parent_pe_firm_name: null })
        .eq('id', childId);

      if (error) throw error;
      toast.success('Relationship removed');
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'buyer', buyerId] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-companies', buyerId] });
    } catch (error) {
      toast.error('Failed to unlink');
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Relationship
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setSearchModalOpen(true)}
            >
              <Plus className="h-3 w-3" />
              {isPEFirm ? 'Add Portfolio Company' : 'Set Parent PE Firm'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {isPEFirm ? (
            // PE Firm view — show portfolio companies
            <div className="space-y-2">
              {portfolioCompanies.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No portfolio companies linked yet.
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground mb-2">
                    This firm's agreement covers all listed portfolio companies
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {portfolioCompanies.map((co) => (
                      <div
                        key={co.id}
                        className="flex items-center gap-1.5 border rounded-md px-2.5 py-1.5 bg-muted/30"
                      >
                        <Link
                          to={`/admin/buyers/${co.id}`}
                          className="text-sm font-medium hover:underline"
                        >
                          {co.company_name}
                        </Link>
                        <BuyerTypeBadge buyerType={co.buyer_type} isPeBacked={co.is_pe_backed ?? undefined} />
                        {co.has_fee_agreement && (
                          <FileCheck className="h-3 w-3 text-green-600" />
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => handleUnlink(co.id)}
                        >
                          <Unlink className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : isPlatformCompany ? (
            // Platform company view — show parent PE firm
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Owned by:</span>
                {parentPeFirmId ? (
                  <Link
                    to={`/admin/buyers/${parentPeFirmId}`}
                    className="text-sm font-semibold hover:underline flex items-center gap-1"
                  >
                    {parentPeFirmName || 'Unknown PE Firm'}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : (
                  <span className="text-sm font-medium">
                    {parentPeFirmName || 'Unknown PE Firm'}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-muted-foreground hover:text-destructive gap-1"
                  onClick={() => handleUnlink(buyerId)}
                >
                  <Unlink className="h-3 w-3" />
                  Unlink
                </Button>
              </div>
            </div>
          ) : (
            // No relationship
            <p className="text-sm text-muted-foreground">
              No parent firm relationship
            </p>
          )}
        </CardContent>
      </Card>

      {/* Search Modal */}
      <Dialog open={searchModalOpen} onOpenChange={setSearchModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isPEFirm ? 'Add Portfolio Company' : 'Set Parent PE Firm'}
            </DialogTitle>
            <DialogDescription>
              Search for an existing {isPEFirm ? 'corporate buyer' : 'PE firm'} to link.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={`Search ${isPEFirm ? 'corporate buyers' : 'PE firms'}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {searchResults.length === 0 && searchQuery.length >= 2 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No results found
                </p>
              )}
              {searchResults.map((result) => (
                <button
                  key={result.id}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-md hover:bg-muted text-left"
                  onClick={() => handleLink(result.id)}
                  disabled={isLinking}
                >
                  <div>
                    <span className="text-sm font-medium">{result.company_name}</span>
                    {result.company_website && (
                      <span className="text-xs text-muted-foreground ml-2">
                        {result.company_website}
                      </span>
                    )}
                  </div>
                  {result.has_fee_agreement && (
                    <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">
                      Fee Agreement
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
