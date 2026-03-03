import { BuyerNotesSection } from "@/components/remarketing/buyer-detail/BuyerNotesSection";
import {
  BusinessDescriptionCard,
  InvestmentCriteriaCard,
  GeographicFootprintCard,
  DealStructureCard,
  CustomerEndMarketCard,
  AcquisitionHistoryCard,
  TranscriptsListCard,
  BuyerServicesBusinessModelCard,
} from "@/components/remarketing/buyer-detail";
import { BuyerData, Transcript, EditDialogType } from "./types";

interface IntelligenceTabProps {
  buyer: BuyerData;
  transcripts: Transcript[];
  setActiveEditDialog: (dialog: EditDialogType) => void;
  updateBuyerMutation: { mutateAsync: (data: Record<string, unknown>) => Promise<unknown> };
  addTranscriptMutation: {
    mutateAsync: (params: { text: string; source: string; fileName?: string; fileUrl?: string; triggerExtract?: boolean }) => Promise<unknown>;
    isPending: boolean;
  };
  extractTranscriptMutation: { isPending: boolean };
  deleteTranscriptMutation: { mutate: (id: string) => void };
  extractionProgress: { current: number; total: number; isRunning: boolean };
  handleSingleExtractWithSummary: (transcriptId: string) => void;
  handleExtractAll: () => void;
}

export const IntelligenceTab = ({
  buyer,
  transcripts,
  setActiveEditDialog,
  updateBuyerMutation,
  addTranscriptMutation,
  extractTranscriptMutation,
  deleteTranscriptMutation,
  extractionProgress,
  handleSingleExtractWithSummary,
  handleExtractAll,
}: IntelligenceTabProps) => {
  return (
    <>
      {/* Buyer Notes Section */}
      <BuyerNotesSection
        notes={buyer?.notes || null}
        onSave={async (notes) => {
          await updateBuyerMutation.mutateAsync({ notes });
        }}
      />
      {/* Two-Column Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BusinessDescriptionCard
          industryVertical={buyer?.industry_vertical}
          businessSummary={buyer?.business_summary}
          servicesOffered={buyer?.target_services}
          onEdit={() => setActiveEditDialog('business')}
          className="bg-muted/30"
        />

        <InvestmentCriteriaCard
          onEdit={() => setActiveEditDialog('investment')}
          className="bg-accent/20"
        />

        <BuyerServicesBusinessModelCard
          servicesOffered={buyer?.services_offered}
          businessModel={buyer?.business_type}
          revenueModel={buyer?.revenue_model}
          onEdit={() => setActiveEditDialog('servicesModel')}
          className="bg-accent/20"
        />

        <GeographicFootprintCard
          targetGeographies={buyer?.target_geographies}
          operatingLocations={buyer?.operating_locations}
          geographicFootprint={buyer?.geographic_footprint}
          serviceRegions={buyer?.service_regions}
          onEdit={() => setActiveEditDialog('geographic')}
          className="bg-muted/30"
        />

        <CustomerEndMarketCard
          primaryCustomerSize={buyer?.primary_customer_size}
          customerGeographicReach={buyer?.customer_geographic_reach}
          customerIndustries={buyer?.customer_industries}
          targetCustomerProfile={buyer?.target_customer_profile}
          onEdit={() => setActiveEditDialog('customer')}
          className="bg-muted/30"
        />

        <DealStructureCard
          minRevenue={buyer?.target_revenue_min}
          maxRevenue={buyer?.target_revenue_max}
          minEbitda={buyer?.target_ebitda_min}
          maxEbitda={buyer?.target_ebitda_max}
          acquisitionAppetite={buyer?.acquisition_appetite}
          acquisitionTimeline={buyer?.acquisition_timeline}
          onEdit={() => setActiveEditDialog('dealStructure')}
          className="bg-accent/20"
        />

        <AcquisitionHistoryCard
          totalAcquisitions={buyer?.total_acquisitions}
          acquisitionFrequency={buyer?.acquisition_frequency}
          onEdit={() => setActiveEditDialog('acquisition')}
          className="bg-accent/20"
        />
      </div>

      {/* Full Width: Transcripts */}
      <TranscriptsListCard
        transcripts={transcripts}
        buyerId={buyer.id}
        companyName={buyer.company_name}
        onAddTranscript={(text, source, fileName, fileUrl, triggerExtract) =>
          addTranscriptMutation.mutateAsync({ text, source, fileName, fileUrl, triggerExtract })
        }
        onExtract={(transcriptId) => handleSingleExtractWithSummary(transcriptId)}
        onExtractAll={handleExtractAll}
        onDelete={(transcriptId) => {
          if (confirm('Delete this transcript?')) {
            deleteTranscriptMutation.mutate(transcriptId);
          }
        }}
        isExtracting={extractTranscriptMutation.isPending || extractionProgress.isRunning}
        extractionProgress={extractionProgress.isRunning ? extractionProgress : undefined}
      />
    </>
  );
};
