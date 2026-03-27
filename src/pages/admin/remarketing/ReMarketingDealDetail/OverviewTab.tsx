import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PipelineSummaryCard } from '@/components/remarketing';
import { DealTranscriptSection } from '@/components/remarketing/DealTranscriptSection';
import {
  GeneralNotesSection,
  OwnerResponseSection,
  ExecutiveSummaryCard,
  ServicesBusinessModelCard,
  GeographicCoverageCard,
  OwnerGoalsCard,
  PrimaryContactCard,
  CustomerTypesCard,
  CompanyOverviewCard,
  AdditionalInfoCard,
  KeyQuotesCard,
  BuyerHistoryDialog,
  EditFinancialsDialog,
} from '@/components/remarketing/deal-detail';
import { format } from 'date-fns';
import type { QueryClient } from '@tanstack/react-query';
import { WebsiteActionsCard } from './WebsiteActionsCard';
import { FinancialOverviewCard } from './FinancialOverviewCard';
import type { DealTranscript } from '../types';

/** Local type covering all deal fields accessed in OverviewTab */
interface DealRecord {
  internal_company_name: string | null;
  title: string | null;
  location: string | null;
  address: string | null;
  founded_year: number | null;
  full_time_employees: number | null;
  part_time_employees: number | null;
  industry: string | null;
  number_of_locations: number | null;
  location_radius_requirement: string | null;
  category: string | null;
  status: string;
  street_address: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  address_country: string | null;
  google_review_count: number | null;
  google_rating: number | null;
  google_maps_url: string | null;
  linkedin_url: string | null;
  linkedin_employee_count: number | null;
  linkedin_employee_range: string | null;
  deal_total_score: number | null;
  revenue: number | null;
  ebitda: number | null;
  executive_summary: string | null;
  service_mix: string | null;
  geographic_states: string[] | null;
  owner_goals: string | null;
  ownership_structure: string | null;
  special_requirements: string | null;
  owner_response: string | null;
  key_quotes: string[] | null;
  main_contact_name: string | null;
  main_contact_email: string | null;
  main_contact_phone: string | null;
  customer_types: string | null;
  customer_concentration: number | string | null;
  customer_geography: string | null;
  owner_notes: string | null;
  internal_notes: string | null;
  key_risks: string | null;
  technology_systems: string | null;
  real_estate_info: string | null;
  growth_trajectory: string | null;
  description: string | null;
  extraction_sources: Record<string, unknown> | null;
  general_notes: string | null;
  created_at: string;
  updated_at: string;
  // Hired a broker flag
  hired_broker?: boolean | null;
  // Fields needed by WebsiteActionsCard
  needs_owner_contact?: boolean | null;
  needs_buyer_search?: boolean | null;
  universe_build_flagged?: boolean | null;
  pushed_to_marketplace?: boolean | null;
  pushed_to_marketplace_at?: string | null;
  website?: string | null;
  // Allow additional unknown fields
  [key: string]: unknown;
}

interface OverviewTabProps {
  deal: DealRecord;
  dealId: string;
  scoreStats: { count: number; approved: number; passed: number; avgScore: number } | undefined;
  pipelineStats:
    | {
        contacted: number;
        responded: number;
        meetingScheduled: number;
        loiSent: number;
        closedWon: number;
        closedLost: number;
      }
    | undefined;
  transcripts: unknown[] | undefined;
  transcriptsLoading: boolean;
  effectiveWebsite: string | null;
  isEnriching: boolean;
  isAnalyzingNotes: boolean;
  buyerHistoryOpen: boolean;
  setBuyerHistoryOpen: (v: boolean) => void;
  editFinancialsOpen: boolean;
  setEditFinancialsOpen: (v: boolean) => void;
  handleEnrichFromWebsite: () => void;
  handleAnalyzeNotes: (notes: string) => void;
  updateDealMutation: {
    mutateAsync: (updates: Record<string, unknown>) => Promise<void>;
    isPending: boolean;
  };
  toggleContactOwnerMutation: { mutate: (v: boolean) => void; isPending: boolean };
  toggleBuyerSearchMutation: { mutate: (v: boolean) => void; isPending: boolean };
  toggleUniverseFlagMutation: { mutate: (v: boolean) => void; isPending: boolean };
  queryClient: QueryClient;
}

export function OverviewTab({
  deal,
  dealId,
  scoreStats,
  pipelineStats,
  transcripts,
  transcriptsLoading,
  effectiveWebsite,
  isEnriching,
  isAnalyzingNotes,
  buyerHistoryOpen,
  setBuyerHistoryOpen,
  editFinancialsOpen,
  setEditFinancialsOpen,
  handleEnrichFromWebsite,
  handleAnalyzeNotes,
  updateDealMutation,
  toggleContactOwnerMutation,
  toggleBuyerSearchMutation,
  toggleUniverseFlagMutation,
  queryClient,
}: OverviewTabProps) {
  return (
    <>
      {scoreStats && scoreStats.count > 0 && (
        <PipelineSummaryCard
          scored={scoreStats.count}
          approved={scoreStats.approved}
          contacted={(pipelineStats?.contacted || 0) + (pipelineStats?.responded || 0)}
          meetingScheduled={pipelineStats?.meetingScheduled || 0}
          closedWon={pipelineStats?.closedWon || 0}
        />
      )}

      <WebsiteActionsCard
        deal={deal}
        dealId={dealId}
        effectiveWebsite={effectiveWebsite}
        scoreStats={scoreStats}
        isEnriching={isEnriching}
        handleEnrichFromWebsite={handleEnrichFromWebsite}
        setBuyerHistoryOpen={setBuyerHistoryOpen}
        toggleContactOwnerMutation={toggleContactOwnerMutation}
        toggleBuyerSearchMutation={toggleBuyerSearchMutation}
        toggleUniverseFlagMutation={toggleUniverseFlagMutation}
      />

      <BuyerHistoryDialog
        open={buyerHistoryOpen}
        onOpenChange={setBuyerHistoryOpen}
        dealId={dealId}
      />

      <CompanyOverviewCard
        companyName={deal.internal_company_name || deal.title}
        website={effectiveWebsite}
        location={deal.location}
        address={deal.address}
        foundedYear={deal.founded_year}
        employees={{
          fullTime: deal.full_time_employees,
          partTime: deal.part_time_employees,
        }}
        industry={deal.industry}
        numberOfLocations={deal.number_of_locations}
        locationRadiusRequirement={deal.location_radius_requirement}
        category={deal.category}
        status={deal.status}
        streetAddress={deal.street_address}
        addressCity={deal.address_city}
        addressState={deal.address_state}
        addressZip={deal.address_zip}
        addressCountry={deal.address_country}
        googleReviewCount={deal.google_review_count ?? undefined}
        googleRating={deal.google_rating ?? undefined}
        googleMapsUrl={deal.google_maps_url ?? undefined}
        linkedinUrl={deal.linkedin_url ?? undefined}
        linkedinEmployeeCount={deal.linkedin_employee_count ?? undefined}
        linkedinEmployeeRange={deal.linkedin_employee_range ?? undefined}
        dealQualityScore={deal.deal_total_score ?? undefined}
        onScoreChange={async (newScore) => {
          await updateDealMutation.mutateAsync({
            deal_total_score: newScore,
          });
        }}
        hiredBroker={!!deal.hired_broker}
        onHiredBrokerChange={async (value) => {
          await updateDealMutation.mutateAsync({ hired_broker: value });
        }}
        onSave={async (data) => {
          await updateDealMutation.mutateAsync({
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

      <FinancialOverviewCard deal={deal} onEditClick={() => setEditFinancialsOpen(true)} />

      <EditFinancialsDialog
        open={editFinancialsOpen}
        onOpenChange={setEditFinancialsOpen}
        data={{
          revenue: deal.revenue,
          ebitda: deal.ebitda,
        }}
        onSave={async (data) => {
          const { _manualEdit, ...financialData } = data;
          const updates: Record<string, unknown> = { ...financialData };

          if (_manualEdit) {
            const existingSources = (deal.extraction_sources as Record<string, unknown>) || {};
            const manualSource = { source: 'manual', timestamp: new Date().toISOString() };
            const sourceUpdates: Record<string, unknown> = { ...existingSources };
            if (data.revenue !== undefined) {
              sourceUpdates.revenue = manualSource;
              sourceUpdates.revenue_source_quote = manualSource;
            }
            if (data.ebitda !== undefined) {
              sourceUpdates.ebitda = manualSource;
              sourceUpdates.ebitda_source_quote = manualSource;
            }
            updates.extraction_sources = sourceUpdates;
            if (data.revenue !== undefined) updates.revenue_source_quote = null;
            if (data.ebitda !== undefined) updates.ebitda_source_quote = null;
          }

          await updateDealMutation.mutateAsync(updates);
          setEditFinancialsOpen(false);
        }}
        isSaving={updateDealMutation.isPending}
      />

      <ExecutiveSummaryCard
        summary={deal.executive_summary}
        onSave={async (summary) => {
          await updateDealMutation.mutateAsync({ executive_summary: summary });
        }}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <ServicesBusinessModelCard
          serviceMix={deal.service_mix}
          onSave={async (data) => {
            await updateDealMutation.mutateAsync({
              service_mix: data.serviceMix,
            });
          }}
        />

        <GeographicCoverageCard
          states={Array.isArray(deal.geographic_states) ? deal.geographic_states : null}
          onSave={async (states) => {
            await updateDealMutation.mutateAsync({ geographic_states: states });
          }}
        />
      </div>

      <OwnerGoalsCard
        ownerGoals={deal.owner_goals}
        ownershipStructure={deal.ownership_structure}
        specialRequirements={deal.special_requirements}
        onSave={async (data) => {
          await updateDealMutation.mutateAsync({
            owner_goals: data.ownerGoals,
            special_requirements: data.specialRequirements,
          });
        }}
      />

      <OwnerResponseSection
        ownerResponse={deal.owner_response}
        onSave={async (response) => {
          await updateDealMutation.mutateAsync({ owner_response: response });
        }}
      />

      <KeyQuotesCard
        quotes={Array.isArray(deal.key_quotes) ? deal.key_quotes : null}
        onSave={async (quotes) => {
          await updateDealMutation.mutateAsync({ key_quotes: quotes });
        }}
      />

      <PrimaryContactCard
        name={deal.main_contact_name}
        email={deal.main_contact_email}
        phone={deal.main_contact_phone}
        onSave={async (data) => {
          await updateDealMutation.mutateAsync({
            main_contact_name: data.name,
            main_contact_email: data.email,
            main_contact_phone: data.phone,
          });
        }}
      />

      <CustomerTypesCard
        customerTypes={deal.customer_types}
        customerConcentration={
          deal.customer_concentration != null ? String(deal.customer_concentration) : undefined
        }
        customerGeography={deal.customer_geography ?? undefined}
        onSave={async (data) => {
          await updateDealMutation.mutateAsync({
            customer_types: data.customerTypes,
            customer_concentration: data.customerConcentration
              ? parseFloat(data.customerConcentration)
              : null,
            customer_geography: data.customerGeography,
          });
        }}
      />

      <AdditionalInfoCard
        otherNotes={deal.owner_notes}
        internalNotes={deal.internal_notes}
        keyRisks={deal.key_risks as string | null}
        technologySystems={deal.technology_systems as string | null}
        realEstateInfo={deal.real_estate_info as string | null}
        growthTrajectory={deal.growth_trajectory as string | null}
        onSave={async (data) => {
          await updateDealMutation.mutateAsync({
            owner_notes: data.otherNotes,
            internal_notes: data.internalNotes,
            key_risks: data.keyRisks,
            technology_systems: data.technologySystems,
            real_estate_info: data.realEstateInfo,
            growth_trajectory: data.growthTrajectory,
          });
        }}
      />

      {deal.description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap">{deal.description}</p>
          </CardContent>
        </Card>
      )}

      <DealTranscriptSection
        dealId={dealId}
        transcripts={(transcripts || []) as unknown as DealTranscript[]}
        isLoading={transcriptsLoading}
        dealInfo={{
          company_name: (deal.internal_company_name || deal.title) ?? undefined,
          main_contact_email: deal.main_contact_email ?? undefined,
        }}
        contactEmail={deal.main_contact_email ?? null}
        contactName={deal.main_contact_name ?? null}
        companyName={deal.internal_company_name || deal.title || ''}
        onSyncComplete={() => {
          queryClient.invalidateQueries({ queryKey: ['remarketing', 'deal-transcripts', dealId] });
        }}
        onTranscriptLinked={() => {
          queryClient.invalidateQueries({ queryKey: ['remarketing', 'deal-transcripts', dealId] });
        }}
      />

      <GeneralNotesSection
        notes={deal.general_notes}
        onSave={async (notes) => {
          await updateDealMutation.mutateAsync({ general_notes: notes });
        }}
        isAnalyzing={isAnalyzingNotes}
        onAnalyze={async (notes: string) => {
          handleAnalyzeNotes(notes);
        }}
      />

      <div className="flex justify-end gap-6 text-xs text-muted-foreground pt-4">
        <span className="flex items-center gap-1">
          Created: {format(new Date(deal.created_at), 'MMM d, yyyy')}
        </span>
        <span className="flex items-center gap-1">
          Updated: {format(new Date(deal.updated_at), 'MMM d, yyyy')}
        </span>
      </div>
    </>
  );
}
