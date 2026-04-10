import { useState } from 'react';
import { BuyerDealHistoryPanel } from '@/components/admin/data-room/BuyerDealHistoryPanel';
import { ExtractionSummaryDialog } from '@/components/remarketing/buyer-detail/ExtractionSummaryDialog';
import { BuyerNotesSection } from '@/components/remarketing/buyer-detail/BuyerNotesSection';
import { FirefliesTranscriptSearch } from '@/components/buyers/FirefliesTranscriptSearch';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  BarChart2,
  Clock,
  FileSignature,
  FolderOpen,
  ListChecks,
  Mail,
  Phone,
  PhoneCall,
  Users,
  Video,
} from 'lucide-react';
import { useBuyerCriteriaFromTranscripts } from '@/hooks/useBuyerCriteriaFromTranscripts';
import { EntityTasksTab, CreateTaskButton } from '@/components/daily-tasks';
import { BuyerAgreementsPanel } from '@/components/remarketing/BuyerAgreementsPanel';
import { BuyerRelationshipSection } from '@/components/remarketing/buyer-detail/BuyerRelationshipSection';
import {
  BuyerDetailHeader,
  CriteriaCompletenessBanner,
  MainContactCard,
  BusinessDescriptionCard,
  InvestmentCriteriaCard,
  GeographicFootprintCard,
  DealStructureCard,
  CustomerEndMarketCard,
  AcquisitionHistoryCard,
  TranscriptsListCard,
  BuyerCompanyOverviewCard,
  BuyerServicesBusinessModelCard,
} from '@/components/remarketing/buyer-detail';

import { EditDialogType, type Contact } from './types';
import { useBuyerData } from './useBuyerData';
import { useBuyerMutations } from './useBuyerMutations';
import { useExtractionHandlers } from './useExtractionHandlers';
import { ContactsTab } from './ContactsTab';
import { DealHistoryTab } from './DealHistoryTab';
import { AddContactDialog } from './AddContactDialog';
import { BuyerEngagementSummary } from '@/components/remarketing/buyer-detail/BuyerEngagementSummary';
import { BuyerActiveDealsSummary } from '@/components/remarketing/buyer-detail/BuyerActiveDealsSummary';
import { useContactCombinedHistory } from '@/hooks/use-contact-combined-history';
import { EditDialogs } from './EditDialogs';
import { CallActivityTab } from './CallActivityTab';
import { EmailHistoryTab } from '@/components/email';

const ReMarketingBuyerDetail = () => {
  const { id } = useParams<{ id: string }>();
  useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const backTo = (location.state as { from?: string } | null)?.from || '/admin/buyers';
  const isNew = id === 'new';

  const [activeEditDialog, setActiveEditDialog] = useState<EditDialogType>(null);

  const {
    buyer,
    isLoading,
    peFirmRecord,
    contacts,
    transcripts,
    recentScores,
    dataCompleteness,
    missingFields,
  } = useBuyerData(id, isNew);

  const {
    enrichMutation,
    findContactsMutation,
    updateBuyerMutation,
    updateFeeAgreementMutation,
    analyzeNotesMutation,
    addContactMutation,
    updateContactMutation,
    deleteContactMutation,
    addTranscriptMutation,
    extractTranscriptMutation,
    deleteTranscriptMutation,
    isContactDialogOpen,
    setIsContactDialogOpen,
    newContact,
    setNewContact,
  } = useBuyerMutations(id, buyer, transcripts, setActiveEditDialog);

  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editContact, setEditContact] = useState({
    name: '',
    email: '',
    phone: '',
    role: '',
    linkedin_url: '',
    is_primary: false,
  });

  const {
    extractionProgress,
    extractionSummary,
    setExtractionSummary,
    handleExtractAll,
    handleSingleExtractWithSummary,
  } = useExtractionHandlers(transcripts, extractTranscriptMutation);

  const { data: transcriptCriteria } = useBuyerCriteriaFromTranscripts(buyer?.id);
  const { data: combinedHistory = [] } = useContactCombinedHistory(buyer?.id || null);

  if (!isNew && isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (isNew) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/admin/buyers">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">New Buyer</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Create New Buyer</CardTitle>
            <CardDescription>Add a new external buyer to the database</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">New buyer creation form - use the existing flow</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <BuyerDetailHeader
            companyName={buyer?.company_name || ''}
            buyerType={buyer?.buyer_type}
            isPeBacked={buyer?.is_pe_backed || false}
            peFirmName={buyer?.pe_firm_name}
            peFirmId={peFirmRecord?.id || null}
            peFirmWebsite={peFirmRecord?.company_website || null}
            platformWebsite={buyer?.platform_website || buyer?.company_website}
            hqCity={buyer?.hq_city}
            hqState={buyer?.hq_state}
            hqCountry={buyer?.hq_country}
            investmentDate={buyer?.investment_date}
            dataCompleteness={dataCompleteness}
            onEdit={() => setActiveEditDialog('business')}
            onEnrich={() => enrichMutation.mutate()}
            isEnriching={enrichMutation.isPending}
            backTo={backTo}
            marketplaceFirmId={buyer?.marketplace_firm_id}
          />
        </div>
        <CreateTaskButton entityType="buyer" entityId={id!} entityName={buyer?.company_name} />
      </div>

      {/* Criteria Completeness Banner */}
      <CriteriaCompletenessBanner
        completenessPercent={dataCompleteness}
        missingFields={missingFields}
        onAutoEnrich={() => enrichMutation.mutate()}
        isEnriching={enrichMutation.isPending}
      />

      {/* Company Overview + Main Contact - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BuyerCompanyOverviewCard
          website={buyer?.platform_website || buyer?.company_website}
          hqCity={buyer?.hq_city}
          hqState={buyer?.hq_state}
          hqCountry={buyer?.hq_country}
          foundedYear={buyer?.founded_year}
          employeeCount={buyer?.num_employees}
          industryVertical={buyer?.industry_vertical}
          numberOfLocations={buyer?.number_of_locations}
          operatingLocations={buyer?.operating_locations}
          onEdit={() => setActiveEditDialog('companyOverview')}
        />
        <MainContactCard
          contacts={
            contacts as unknown as {
              id: string;
              name: string;
              email?: string | null;
              phone?: string | null;
              role?: string | null;
              linkedin_url?: string | null;
              is_primary?: boolean;
            }[]
          }
          onAddContact={() => setIsContactDialogOpen(true)}
          hasFeeAgreement={buyer?.has_fee_agreement || false}
          onFeeAgreementChange={(value) => updateFeeAgreementMutation.mutate(value)}
          feeAgreementDisabled={updateFeeAgreementMutation.isPending}
        />
      </div>

      {/* Relationship Section */}
      <BuyerRelationshipSection
        buyerId={buyer?.id || ''}
        buyerType={buyer?.buyer_type || null}
        isPeBacked={buyer?.is_pe_backed || false}
        parentPeFirmId={buyer?.parent_pe_firm_id || null}
        parentPeFirmName={buyer?.parent_pe_firm_name || null}
      />

      {/* Multi-Deal Summary */}
      {buyer?.id && <BuyerActiveDealsSummary buyerId={buyer.id} />}

      {/* Engagement Summary */}
      {combinedHistory.length > 0 && (
        <BuyerEngagementSummary entries={combinedHistory} />
      )}

      {/* Main Content Tabs */}
      <Tabs defaultValue="intelligence" className="space-y-4">
        <TabsList>
          <TabsTrigger value="intelligence" className="text-sm">
            <BarChart2 className="mr-1.5 h-3.5 w-3.5" />
            Intelligence
          </TabsTrigger>
          <TabsTrigger value="call-history" className="text-sm">
            <Phone className="mr-1.5 h-3.5 w-3.5" />
            Call History
          </TabsTrigger>
          <TabsTrigger value="call-activity" className="text-sm">
            <PhoneCall className="mr-1.5 h-3.5 w-3.5" />
            Call Activity
          </TabsTrigger>
          <TabsTrigger value="history" className="text-sm">
            <Clock className="mr-1.5 h-3.5 w-3.5" />
            Deal History ({recentScores?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="contacts" className="text-sm">
            <Users className="mr-1.5 h-3.5 w-3.5" />
            Contacts ({contacts?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="agreements" className="text-sm">
            <FileSignature className="mr-1.5 h-3.5 w-3.5" />
            Agreements
          </TabsTrigger>
          <TabsTrigger value="tasks" className="text-sm">
            <ListChecks className="mr-1.5 h-3.5 w-3.5" />
            Tasks
          </TabsTrigger>
          <TabsTrigger value="email" className="text-sm">
            <Mail className="mr-1.5 h-3.5 w-3.5" />
            Email
          </TabsTrigger>
          <TabsTrigger value="materials" className="text-sm">
            <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
            Materials
          </TabsTrigger>
        </TabsList>

        {/* Intelligence Tab */}
        <TabsContent value="intelligence" className="space-y-4">
          {/* Buyer Notes Section */}
          <BuyerNotesSection
            notes={buyer?.notes || null}
            onSave={async (notes) => {
              await updateBuyerMutation.mutateAsync({ notes });
            }}
            onAnalyze={async (notes) => {
              await analyzeNotesMutation.mutateAsync(notes);
            }}
            isAnalyzing={analyzeNotesMutation.isPending}
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
              investmentThesis={transcriptCriteria?.thesis_summary ?? buyer?.thesis_summary}
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
              targetGeographies={
                transcriptCriteria?.target_states?.length
                  ? transcriptCriteria.target_states
                  : buyer?.target_geographies
              }
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
              minRevenue={transcriptCriteria?.target_revenue_min ?? buyer?.target_revenue_min}
              maxRevenue={transcriptCriteria?.target_revenue_max ?? buyer?.target_revenue_max}
              minEbitda={transcriptCriteria?.target_ebitda_min ?? buyer?.target_ebitda_min}
              maxEbitda={transcriptCriteria?.target_ebitda_max ?? buyer?.target_ebitda_max}
              acquisitionAppetite={buyer?.acquisition_appetite}
              acquisitionTimeline={
                transcriptCriteria?.acquisition_timeline ?? buyer?.acquisition_timeline
              }
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

          {transcriptCriteria?.sources?.length ? (
            <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <Video className="h-3 w-3" />
              Criteria sourced from {transcriptCriteria.sources.length} transcript
              {transcriptCriteria.sources.length > 1 ? 's' : ''}
              {transcriptCriteria.sources[0] && (
                <span>— Latest: {transcriptCriteria.sources[0].title}</span>
              )}
            </div>
          ) : null}

          {/* Full Width: Transcripts */}
          <TranscriptsListCard
            transcripts={transcripts}
            buyerId={buyer!.id}
            companyName={buyer!.company_name}
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
        </TabsContent>

        {/* Call History Tab */}
        <TabsContent value="call-history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Find Call Transcripts</CardTitle>
              <CardDescription>
                Search your Fireflies call history to link relevant conversations with this buyer
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FirefliesTranscriptSearch
                buyerId={buyer?.id || ''}
                companyName={buyer?.company_name || buyer?.pe_firm_name || ''}
                peFirmName={buyer?.pe_firm_name}
                platformWebsite={buyer?.platform_website || buyer?.company_website}
                contacts={
                  contacts
                    ?.map((c: Contact) => ({ email: c.email! }))
                    .filter((c): c is { email: string } => !!c.email) || []
                }
                onTranscriptLinked={() => {
                  queryClient.invalidateQueries({ queryKey: ['remarketing', 'transcripts', id] });
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Call Activity Tab (PhoneBurner) */}
        <TabsContent value="call-activity" className="space-y-4">
          <CallActivityTab buyerId={buyer?.id || ''} />
        </TabsContent>

        {/* Deal History Tab */}
        <TabsContent value="history">
          <DealHistoryTab
            recentScores={
              (recentScores ?? []) as {
                id: string;
                listing?: { id: string; title?: string } | null;
                composite_score: number;
                tier: string | null;
                status: string;
                created_at: string;
              }[]
            }
          />
        </TabsContent>

        {/* Contacts Tab */}
        <TabsContent value="contacts">
          <ContactsTab
            contacts={contacts}
            onAddContact={() => setIsContactDialogOpen(true)}
            onEditContact={(contact) => {
              setEditingContact(contact);
              setEditContact({
                name: contact.name,
                email: contact.email || '',
                phone: contact.phone || '',
                role: contact.role || '',
                linkedin_url: contact.linkedin_url || '',
                is_primary: contact.is_primary || false,
              });
              setIsEditDialogOpen(true);
            }}
            onDeleteContact={(contactId) => deleteContactMutation.mutate(contactId)}
            onEnrichContacts={() => findContactsMutation.mutate()}
            isEnrichingContacts={findContactsMutation.isPending}
          />
        </TabsContent>

        {/* Agreements Tab */}
        <TabsContent value="agreements">
          <BuyerAgreementsPanel
            buyerId={buyer?.id || ''}
            marketplaceFirmId={buyer?.marketplace_firm_id || null}
            hasFeeAgreement={buyer?.has_fee_agreement || false}
            feeAgreementSource={buyer?.fee_agreement_source || null}
          />
        </TabsContent>

        <TabsContent value="tasks">
          <EntityTasksTab entityType="buyer" entityId={id!} entityName={buyer?.company_name} />
        </TabsContent>

        <TabsContent value="email" className="space-y-4">
          {contacts && contacts.length > 0 ? (
            <EmailHistoryTab
              contactId={contacts[0].id}
              additionalContactIds={contacts.slice(1).map((c: Contact) => c.id)}
              contactName={buyer?.company_name}
              contactEmail={contacts.find((c: Contact) => c.email)?.email || undefined}
            />
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>No contacts linked to this buyer. Add a contact to view email history.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="materials">
          <BuyerDealHistoryPanel buyerId={id!} />
        </TabsContent>
      </Tabs>

      {/* Add Contact Dialog */}
      <AddContactDialog
        open={isContactDialogOpen}
        onOpenChange={setIsContactDialogOpen}
        newContact={newContact}
        onContactChange={setNewContact}
        onSubmit={() => addContactMutation.mutate()}
        isPending={addContactMutation.isPending}
      />

      {/* Edit Contact Dialog */}
      <AddContactDialog
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          setIsEditDialogOpen(open);
          if (!open) setEditingContact(null);
        }}
        newContact={editContact}
        onContactChange={setEditContact}
        onSubmit={() => {
          if (!editingContact) return;
          updateContactMutation.mutate(
            { id: editingContact.id, ...editContact },
            {
              onSuccess: () => {
                setIsEditDialogOpen(false);
                setEditingContact(null);
              },
            },
          );
        }}
        isPending={updateContactMutation.isPending}
        editMode
      />

      {/* Edit Dialogs */}
      <EditDialogs
        activeEditDialog={activeEditDialog}
        setActiveEditDialog={setActiveEditDialog}
        buyer={buyer}
        onSave={(data) => updateBuyerMutation.mutate(data)}
        isSaving={updateBuyerMutation.isPending}
      />

      <ExtractionSummaryDialog
        open={extractionSummary.open}
        onOpenChange={(open) => setExtractionSummary((prev) => ({ ...prev, open }))}
        results={extractionSummary.results}
        totalCount={extractionSummary.totalCount}
        successCount={extractionSummary.successCount}
        errorCount={extractionSummary.errorCount}
      />
    </div>
  );
};

export default ReMarketingBuyerDetail;
