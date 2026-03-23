import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Link as LinkIcon, 
  Check, 
  X, 
  Building2, 
  MapPin,
  ArrowRight,
  Sparkles,
  FileText,
  Download
} from "lucide-react";
import { toast } from "sonner";

// Export interface for deal mappings
export interface DealIdMapping {
  referenceDealId: string;
  referenceDomain: string;
  listingId: string;
  matchedBy: string;
}

interface ReferenceDeal {
  id: string;
  company_name: string;
  domain?: string;
  industry_type?: string;
  geography?: string[];
  revenue?: number;
  ebitda_amount?: number;
  owner_goals?: string;
  transcript_link?: string;
  additional_info?: string;
}

interface MarketplaceListing {
  id: string;
  title: string;
  location?: string;
  revenue?: number;
  ebitda?: number;
  status?: string;
}

interface MergeMapping {
  referenceDealId: string;
  listingId: string | null;
  action: 'link' | 'create' | 'skip';
  confidence: 'high' | 'medium' | 'low';
}

interface DealMergePanelProps {
  onMappingsCreated?: (mappings: DealIdMapping[]) => void;
}

// Parse CSV data for reference deals
const parseReferenceDeals = (csvContent: string): ReferenceDeal[] => {
  const lines = csvContent.split('\n');
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(';');
  const deals: ReferenceDeal[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(';');
    if (values.length < 2) continue;
    
    const deal: ReferenceDeal = {
      id: values[headers.indexOf('id')] || '',
      company_name: values[headers.indexOf('company_name')] || '',
      domain: values[headers.indexOf('domain')] || undefined,
      industry_type: values[headers.indexOf('industry_type')] || undefined,
      revenue: parseFloat(values[headers.indexOf('revenue')]) || undefined,
      ebitda_amount: parseFloat(values[headers.indexOf('ebitda_amount')]) || undefined,
      owner_goals: values[headers.indexOf('owner_goals')] || undefined,
      transcript_link: values[headers.indexOf('transcript_link')] || undefined,
      additional_info: values[headers.indexOf('additional_info')] || undefined,
    };
    
    // Parse geography array
    const geoStr = values[headers.indexOf('geography')];
    if (geoStr) {
      try {
        deal.geography = JSON.parse(geoStr.replace(/"/g, '"'));
      } catch {
        deal.geography = [];
      }
    }
    
    if (deal.id && deal.company_name) {
      deals.push(deal);
    }
  }
  
  return deals;
};

// Find potential matches between reference deals and listings
const findPotentialMatches = (
  deals: ReferenceDeal[], 
  listings: MarketplaceListing[]
): MergeMapping[] => {
  return deals.map(deal => {
    // Try to find matching listing by domain, name similarity, or financials
    let bestMatch: MarketplaceListing | null = null;
    let confidence: 'high' | 'medium' | 'low' = 'low';
    
    // Check for exact domain match in title
    if (deal.domain && !deal.domain.startsWith('manual-')) {
      const domainMatch = listings.find(l => 
        l.title.toLowerCase().includes(deal.domain!.replace(/\.com|\.net|\.org/g, '').toLowerCase())
      );
      if (domainMatch) {
        bestMatch = domainMatch;
        confidence = 'high';
      }
    }
    
    // Check for company name in title
    if (!bestMatch && deal.company_name) {
      const nameWords = deal.company_name.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const nameMatch = listings.find(l => {
        const titleLower = l.title.toLowerCase();
        return nameWords.some(word => titleLower.includes(word));
      });
      if (nameMatch) {
        bestMatch = nameMatch;
        confidence = 'medium';
      }
    }
    
    // Check for revenue + industry match
    if (!bestMatch && deal.revenue && deal.industry_type) {
      const revenueMatch = listings.find(l => {
        if (!l.revenue) return false;
        const revDiff = Math.abs(l.revenue - deal.revenue!) / deal.revenue!;
        return revDiff < 0.15; // Within 15%
      });
      if (revenueMatch) {
        bestMatch = revenueMatch;
        confidence = 'low';
      }
    }
    
    return {
      referenceDealId: deal.id,
      listingId: bestMatch?.id || null,
      action: bestMatch ? 'link' : 'skip',
      confidence,
    };
  });
};

const formatCurrency = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '—';
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

export const DealMergePanel = ({ onMappingsCreated }: DealMergePanelProps) => {
  const queryClient = useQueryClient();
  const [mappings, setMappings] = useState<MergeMapping[]>([]);
  const [referenceDeals, setReferenceDeals] = useState<ReferenceDeal[]>([]);
  const [selectedDeal, setSelectedDeal] = useState<ReferenceDeal | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [createdMappings, setCreatedMappings] = useState<DealIdMapping[]>([]);

  // Fetch marketplace listings
  const { data: listings, isLoading: listingsLoading } = useQuery({
    queryKey: ['listings', 'for-merge'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listings')
        .select('id, title, location, revenue, ebitda, status')
        .order('title');
      
      if (error) throw error;
      return (data || []) as MarketplaceListing[];
    }
  });

  // Load reference deals from CSV
  const loadReferenceDeals = async () => {
    try {
      const response = await fetch('/data/companies.csv');
      const csvContent = await response.text();
      const deals = parseReferenceDeals(csvContent);
      setReferenceDeals(deals);
      
      if (listings) {
        const autoMappings = findPotentialMatches(deals, listings);
        setMappings(autoMappings);
      }
      
      toast.success(`Loaded ${deals.length} reference deals`);
    } catch (error) {
      toast.error('Failed to load reference deals');
    }
  };

  // Update mapping for a deal
  const updateMapping = (dealId: string, listingId: string | null, action: 'link' | 'create' | 'skip') => {
    setMappings(prev => prev.map(m => 
      m.referenceDealId === dealId 
        ? { ...m, listingId, action, confidence: listingId ? 'high' : 'low' }
        : m
    ));
  };

  // Execute merge
  const mergeMutation = useMutation({
    mutationFn: async () => {
      const linksToCreate = mappings.filter(m => m.action === 'link' && m.listingId);
      const dealsToCreate = mappings.filter(m => m.action === 'create');
      
      // Build deal ID mappings for export
      const dealMappings: DealIdMapping[] = [];
      
      // Create deal transcripts for linked deals with transcript_link
      for (const mapping of linksToCreate) {
        const deal = referenceDeals.find(d => d.id === mapping.referenceDealId);
        if (deal && mapping.listingId) {
          // Store the mapping
          dealMappings.push({
            referenceDealId: deal.id,
            referenceDomain: deal.domain || deal.company_name,
            listingId: mapping.listingId,
            matchedBy: mapping.confidence === 'high' ? 'domain' : 
                       mapping.confidence === 'medium' ? 'name' : 'financial'
          });
          
          // Create deal transcript if we have additional info
          if (deal.transcript_link || deal.additional_info || deal.owner_goals) {
            await supabase
              .from('deal_transcripts')
              .upsert(
                {
                  listing_id: mapping.listingId,
                  transcript_text: `Reference Deal: ${deal.company_name}\n\nOwner Goals: ${deal.owner_goals || 'Not specified'}\n\nAdditional Info: ${deal.additional_info || 'None'}`,
                  source: deal.transcript_link || 'reference-import',
                },
                {
                  onConflict: 'listing_id',
                }
              );
          }
        }
      }
      
      return { linked: linksToCreate.length, created: dealsToCreate.length, mappings: dealMappings };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['listings'] });
      setCreatedMappings(result.mappings);
      
      // Call callback with mappings
      if (onMappingsCreated) {
        onMappingsCreated(result.mappings);
      }
      
      // Also store in localStorage for persistence across import steps
      try {
        const existingMappings = JSON.parse(localStorage.getItem('dealIdMappings') || '{}');
        const newMappings = result.mappings.reduce((acc, m) => {
          acc[m.referenceDealId] = m.listingId;
          return acc;
        }, {} as Record<string, string>);
        localStorage.setItem('dealIdMappings', JSON.stringify({ ...existingMappings, ...newMappings }));
      } catch (e) {
        // Failed to store deal mappings in localStorage — non-critical
      }
      
      toast.success(`Merged ${result.linked} deals, created ${result.mappings.length} mappings`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    }
  });

  // Export mappings as JSON
  const exportMappings = () => {
    const storedMappings = localStorage.getItem('dealIdMappings');
    if (storedMappings) {
      const blob = new Blob([storedMappings], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'deal-id-mappings.json';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Mappings exported');
    } else {
      toast.error('No mappings to export');
    }
  };

  const linkedCount = mappings.filter(m => m.action === 'link').length;
  const skipCount = mappings.filter(m => m.action === 'skip').length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Reference Deal Merger</CardTitle>
              <CardDescription>
                Match and merge reference deals with existing marketplace listings
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {createdMappings.length > 0 && (
                <Button variant="outline" size="sm" onClick={exportMappings}>
                  <Download className="mr-2 h-4 w-4" />
                  Export Mappings
                </Button>
              )}
              <Button onClick={loadReferenceDeals} disabled={listingsLoading}>
                <Sparkles className="mr-2 h-4 w-4" />
                Load & Auto-Match
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {referenceDeals.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">No reference deals loaded</p>
              <p className="text-sm">Click "Load & Auto-Match" to analyze reference deals</p>
            </div>
          ) : (
            <>
              {/* Summary Stats */}
              <div className="flex items-center gap-4 mb-6">
                <Badge variant="secondary" className="text-sm px-3 py-1">
                  {referenceDeals.length} Reference Deals
                </Badge>
                <Badge variant="default" className="text-sm px-3 py-1 bg-emerald-500">
                  <Check className="h-3 w-3 mr-1" />
                  {linkedCount} Matched
                </Badge>
                <Badge variant="outline" className="text-sm px-3 py-1">
                  <X className="h-3 w-3 mr-1" />
                  {skipCount} Unmatched
                </Badge>
                {createdMappings.length > 0 && (
                  <Badge className="bg-blue-500 text-sm px-3 py-1">
                    {createdMappings.length} Mappings Created
                  </Badge>
                )}
              </div>

              {/* Mappings Table */}
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[250px]">Reference Deal</TableHead>
                      <TableHead className="w-[100px]">Revenue</TableHead>
                      <TableHead className="w-[80px]">Match</TableHead>
                      <TableHead>Marketplace Listing</TableHead>
                      <TableHead className="w-[100px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {referenceDeals.map((deal) => {
                      const mapping = mappings.find(m => m.referenceDealId === deal.id);
                      
                      return (
                        <TableRow key={deal.id}>
                          <TableCell>
                            <div 
                              className="cursor-pointer hover:text-primary"
                              onClick={() => {
                                setSelectedDeal(deal);
                                setIsPreviewOpen(true);
                              }}
                            >
                              <p className="font-medium">{deal.company_name}</p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {deal.geography?.join(', ') || deal.industry_type || '—'}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            {formatCurrency(deal.revenue)}
                          </TableCell>
                          <TableCell>
                            {mapping?.confidence === 'high' && (
                              <Badge className="bg-emerald-500">High</Badge>
                            )}
                            {mapping?.confidence === 'medium' && (
                              <Badge variant="secondary">Medium</Badge>
                            )}
                            {mapping?.confidence === 'low' && (
                              <Badge variant="outline">Low</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={mapping?.listingId || 'none'}
                              onValueChange={(value) => {
                                updateMapping(
                                  deal.id, 
                                  value === 'none' ? null : value,
                                  value === 'none' ? 'skip' : 'link'
                                );
                              }}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select listing..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">
                                  <span className="text-muted-foreground">No match</span>
                                </SelectItem>
                                {listings?.map(listing => (
                                  <SelectItem key={listing.id} value={listing.id}>
                                    <div className="flex items-center gap-2">
                                      <Building2 className="h-3 w-3" />
                                      <span className="truncate max-w-[200px]">{listing.title}</span>
                                      <span className="text-muted-foreground text-xs">
                                        {formatCurrency(listing.revenue)}
                                      </span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            {mapping?.action === 'link' && mapping.listingId && (
                              <Badge variant="default" className="bg-emerald-500">
                                <LinkIcon className="h-3 w-3 mr-1" />
                                Link
                              </Badge>
                            )}
                            {mapping?.action === 'skip' && (
                              <Badge variant="outline">Skip</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>

              {/* Execute Button */}
              <div className="flex justify-end mt-6">
                <Button 
                  onClick={() => mergeMutation.mutate()}
                  disabled={linkedCount === 0 || mergeMutation.isPending}
                >
                  <ArrowRight className="mr-2 h-4 w-4" />
                  {mergeMutation.isPending ? 'Merging...' : `Merge ${linkedCount} Deals`}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Deal Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedDeal?.company_name}</DialogTitle>
            <DialogDescription>
              Reference deal details
            </DialogDescription>
          </DialogHeader>
          {selectedDeal && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Industry</p>
                  <p>{selectedDeal.industry_type || '—'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Geography</p>
                  <p>{selectedDeal.geography?.join(', ') || '—'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Revenue</p>
                  <p>{formatCurrency(selectedDeal.revenue)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">EBITDA</p>
                  <p>{formatCurrency(selectedDeal.ebitda_amount)}</p>
                </div>
              </div>
              {selectedDeal.owner_goals && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Owner Goals</p>
                  <p className="text-sm bg-muted p-3 rounded-lg whitespace-pre-wrap">
                    {selectedDeal.owner_goals}
                  </p>
                </div>
              )}
              {selectedDeal.additional_info && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Additional Info</p>
                  <p className="text-sm bg-muted p-3 rounded-lg whitespace-pre-wrap max-h-48 overflow-auto">
                    {selectedDeal.additional_info}
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPreviewOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
