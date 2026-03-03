import {
  EditBusinessDescriptionDialog,
  EditInvestmentCriteriaDialog,
  EditDealStructureDialog,
  EditGeographicFootprintDialog,
  EditCustomerInfoDialog,
  EditAcquisitionHistoryDialog,
  EditBuyerCompanyOverviewDialog,
  EditBuyerServicesBusinessModelDialog,
} from "@/components/remarketing/buyer-detail";
import { BuyerData, EditDialogType } from "./types";

interface EditDialogsProps {
  activeEditDialog: EditDialogType;
  setActiveEditDialog: (dialog: EditDialogType) => void;
  buyer: BuyerData | null | undefined;
  onSave: (data: Record<string, unknown>) => void;
  isSaving: boolean;
}

export const EditDialogs = ({
  activeEditDialog,
  setActiveEditDialog,
  buyer,
  onSave,
  isSaving,
}: EditDialogsProps) => {
  return (
    <>
      <EditBusinessDescriptionDialog
        open={activeEditDialog === 'business'}
        onOpenChange={(open) => !open && setActiveEditDialog(null)}
        data={{
          industryVertical: buyer?.industry_vertical,
          businessSummary: buyer?.business_summary,
          servicesOffered: buyer?.target_services,
        }}
        onSave={(data) => onSave(data)}
        isSaving={isSaving}
      />

      <EditInvestmentCriteriaDialog
        open={activeEditDialog === 'investment'}
        onOpenChange={(open) => !open && setActiveEditDialog(null)}
        onSave={(data) => onSave(data)}
        isSaving={isSaving}
      />

      <EditDealStructureDialog
        open={activeEditDialog === 'dealStructure'}
        onOpenChange={(open) => !open && setActiveEditDialog(null)}
        data={{
          minRevenue: buyer?.target_revenue_min,
          maxRevenue: buyer?.target_revenue_max,
          minEbitda: buyer?.target_ebitda_min,
          maxEbitda: buyer?.target_ebitda_max,
          acquisitionAppetite: buyer?.acquisition_appetite,
          acquisitionTimeline: buyer?.acquisition_timeline,
        }}
        onSave={(data) => onSave(data)}
        isSaving={isSaving}
      />

      <EditGeographicFootprintDialog
        open={activeEditDialog === 'geographic'}
        onOpenChange={(open) => !open && setActiveEditDialog(null)}
        data={{
          targetGeographies: buyer?.target_geographies,
        }}
        onSave={(data) => onSave(data)}
        isSaving={isSaving}
      />

      <EditCustomerInfoDialog
        open={activeEditDialog === 'customer'}
        onOpenChange={(open) => !open && setActiveEditDialog(null)}
        data={{
          primaryCustomerSize: buyer?.primary_customer_size,
          customerGeographicReach: buyer?.customer_geographic_reach,
          customerIndustries: buyer?.customer_industries,
          targetCustomerProfile: buyer?.target_customer_profile,
        }}
        onSave={(data) => onSave(data)}
        isSaving={isSaving}
      />

      <EditAcquisitionHistoryDialog
        open={activeEditDialog === 'acquisition'}
        onOpenChange={(open) => !open && setActiveEditDialog(null)}
        data={{
          totalAcquisitions: buyer?.total_acquisitions,
          acquisitionFrequency: buyer?.acquisition_frequency,
        }}
        onSave={(data) => onSave(data)}
        isSaving={isSaving}
      />

      <EditBuyerCompanyOverviewDialog
        open={activeEditDialog === 'companyOverview'}
        onOpenChange={(open) => !open && setActiveEditDialog(null)}
        website={buyer?.platform_website || buyer?.company_website}
        hqCity={buyer?.hq_city}
        hqState={buyer?.hq_state}
        hqCountry={buyer?.hq_country}
        foundedYear={buyer?.founded_year}
        employeeCount={buyer?.num_employees}
        industryVertical={buyer?.industry_vertical}
        numberOfLocations={buyer?.number_of_locations}
        onSave={async (data) => {
          const updateData: Record<string, unknown> = {};
          if (data.company_website !== undefined) updateData.company_website = data.company_website;
          if (data.hq_city !== undefined) updateData.hq_city = data.hq_city;
          if (data.hq_state !== undefined) updateData.hq_state = data.hq_state;
          if (data.hq_country !== undefined) updateData.hq_country = data.hq_country;
          if (data.industry_vertical !== undefined) updateData.industry_vertical = data.industry_vertical;
          if (data.founded_year !== undefined) updateData.founded_year = data.founded_year;
          if (data.num_employees !== undefined) updateData.num_employees = data.num_employees;
          if (data.number_of_locations !== undefined) updateData.number_of_locations = data.number_of_locations;
          onSave(updateData);
        }}
        isSaving={isSaving}
      />

      <EditBuyerServicesBusinessModelDialog
        open={activeEditDialog === 'servicesModel'}
        onOpenChange={(open) => !open && setActiveEditDialog(null)}
        servicesOffered={buyer?.services_offered}
        businessModel={buyer?.business_type}
        revenueModel={buyer?.revenue_model}
        onSave={async (data) => {
          onSave(data);
        }}
        isSaving={isSaving}
      />
    </>
  );
};
