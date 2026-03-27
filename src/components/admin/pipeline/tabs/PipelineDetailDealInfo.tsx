import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Deal } from '@/hooks/admin/use-deals';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, DollarSign } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  CompanyOverviewCard,
  ExecutiveSummaryCard,
  ServicesBusinessModelCard,
  GeographicCoverageCard,
  OwnerGoalsCard,
  CustomerTypesCard,
  KeyQuotesCard,
} from '@/components/remarketing/deal-detail';

interface PipelineDetailDealInfoProps {
  deal: Deal;
}

const formatCurrency = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '–';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
};

export function PipelineDetailDealInfo({ deal }: PipelineDetailDealInfoProps) {
  const queryClient = useQueryClient();

  const { data: listing, isLoading } = useQuery({
    queryKey: ['pipeline-listing-detail', deal.listing_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('id', deal.listing_id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!deal.listing_id,
    staleTime: 60_000,
  });

  const updateListing = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      const { error } = await supabase
        .from('listings')
        .update(updates)
        .eq('id', deal.listing_id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-listing-detail', deal.listing_id] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="flex-1 flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">No listing data found for this deal.</p>
      </div>
    );
  }

  const effectiveWebsite = listing.website || null;

  return (
    <ScrollArea className="flex-1">
      <div className="px-6 pb-8 space-y-4">
        {/* Company Overview */}
        <CompanyOverviewCard
          companyName={listing.internal_company_name || listing.title}
          website={effectiveWebsite}
          location={listing.location}
          address={listing.address}
          foundedYear={listing.founded_year}
          employees={{
            fullTime: listing.full_time_employees,
            partTime: listing.part_time_employees,
          }}
          industry={listing.industry}
          numberOfLocations={listing.number_of_locations}
          locationRadiusRequirement={listing.location_radius_requirement}
          category={listing.category}
          status={listing.status}
          streetAddress={listing.street_address}
          addressCity={listing.address_city}
          addressState={listing.address_state}
          addressZip={listing.address_zip}
          addressCountry={listing.address_country}
          googleReviewCount={listing.google_review_count ?? undefined}
          googleRating={listing.google_rating ?? undefined}
          googleMapsUrl={listing.google_maps_url ?? undefined}
          linkedinUrl={listing.linkedin_url ?? undefined}
          linkedinEmployeeCount={listing.linkedin_employee_count ?? undefined}
          linkedinEmployeeRange={listing.linkedin_employee_range ?? undefined}
          dealQualityScore={listing.deal_total_score ?? undefined}
          onScoreChange={async (newScore) => {
            await updateListing.mutateAsync({ deal_total_score: newScore });
          }}
          hiredBroker={!!(listing as Record<string, unknown>).hired_broker}
          onHiredBrokerChange={async (value) => {
            await updateListing.mutateAsync({ hired_broker: value });
          }}
          onSave={async (data) => {
            await updateListing.mutateAsync({
              internal_company_name: data.companyName,
              website: data.website,
              address: data.address,
              founded_year: data.foundedYear,
              industry: data.industry,
              number_of_locations: data.numberOfLocations,
              location_radius_requirement: data.locationRadiusRequirement,
              street_address: data.streetAddress,
              address_city: data.addressCity,
              address_state: data.addressState,
              address_zip: data.addressZip,
              address_country: data.addressCountry,
              linkedin_url: data.linkedinUrl,
              linkedin_employee_count: data.linkedinEmployeeCount,
              linkedin_employee_range: data.linkedinEmployeeRange,
              full_time_employees: data.fullTimeEmployees,
              part_time_employees: data.partTimeEmployees,
              google_rating: data.googleRating,
              google_review_count: data.googleReviewCount,
              google_maps_url: data.googleMapsUrl,
              hired_broker: data.hiredBroker,
            });
          }}
        />

        {/* Financial Overview */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Financial Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-6">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Revenue</p>
                <span className="text-2xl font-bold">{formatCurrency(listing.revenue)}</span>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">EBITDA</p>
                <span className="text-2xl font-bold">{formatCurrency(listing.ebitda)}</span>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">EBITDA Margin</p>
                <span className="text-2xl font-bold">
                  {listing.revenue && listing.ebitda
                    ? `${((listing.ebitda / listing.revenue) * 100).toFixed(0)}%`
                    : '–'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Executive Summary */}
        <ExecutiveSummaryCard
          summary={listing.executive_summary}
          onSave={async (summary) => {
            await updateListing.mutateAsync({ executive_summary: summary });
          }}
        />

        {/* Services & Geographic */}
        <div className="grid gap-4 grid-cols-2">
          <ServicesBusinessModelCard
            serviceMix={listing.service_mix}
            onSave={async (data) => {
              await updateListing.mutateAsync({ service_mix: data.serviceMix });
            }}
          />
          <GeographicCoverageCard
            states={Array.isArray(listing.geographic_states) ? listing.geographic_states : null}
            onSave={async (states) => {
              await updateListing.mutateAsync({ geographic_states: states });
            }}
          />
        </div>

        {/* Owner Goals */}
        <OwnerGoalsCard
          ownerGoals={listing.owner_goals}
          ownershipStructure={listing.ownership_structure}
          specialRequirements={listing.special_requirements}
          onSave={async (data) => {
            await updateListing.mutateAsync({
              owner_goals: data.ownerGoals,
              special_requirements: data.specialRequirements,
            });
          }}
        />

        {/* Key Quotes */}
        <KeyQuotesCard
          quotes={Array.isArray(listing.key_quotes) ? listing.key_quotes : null}
          onSave={async (quotes) => {
            await updateListing.mutateAsync({ key_quotes: quotes });
          }}
        />

        {/* Customer Types */}
        <CustomerTypesCard
          customerTypes={listing.customer_types}
          customerConcentration={listing.customer_concentration != null ? String(listing.customer_concentration) : undefined}
          customerGeography={listing.customer_geography ?? undefined}
          onSave={async (data) => {
            await updateListing.mutateAsync({
              customer_types: data.customerTypes,
              customer_concentration: data.customerConcentration ? parseFloat(data.customerConcentration) : null,
              customer_geography: data.customerGeography,
            });
          }}
        />
      </div>
    </ScrollArea>
  );
}
