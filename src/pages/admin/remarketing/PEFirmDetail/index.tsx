import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Building2,
  ExternalLink,
  MapPin,
  Globe,
  Linkedin,
  Users,
  BarChart3,
  Brain,
  MessageSquare,
  FileSignature,
  ListChecks,
} from "lucide-react";
import { usePEFirmData } from "./usePEFirmData";
import { getFirmTypeLabel } from "./utils";
import { PlatformsTab } from "./PlatformsTab";
import { ContactsTab } from "./ContactsTab";
import { IntelligenceTab } from "./IntelligenceTab";
import { DealActivityTab } from "./DealActivityTab";
import { NotesCallsTab } from "./NotesCallsTab";
import { AddContactDialog } from "./AddContactDialog";
import { AddPlatformDialog } from "./AddPlatformDialog";
import { BuyerAgreementsPanel } from "@/components/remarketing/BuyerAgreementsPanel";
import { EntityTasksTab, CreateTaskButton } from "@/components/daily-tasks";

const PEFirmDetail = () => {
  const {
    navigate,
    queryClient,
    firm,
    firmLoading,
    platforms,
    platformsLoading,
    contacts,
    dealScores,
    dealStats,
    transcripts,
    universes,
    isContactDialogOpen,
    setIsContactDialogOpen,
    isAddPlatformDialogOpen,
    setIsAddPlatformDialogOpen,
    newContact,
    setNewContact,
    newPlatform,
    setNewPlatform,
    updateFirmMutation,
    addContactMutation,
    deleteContactMutation,
    addPlatformMutation,
  } = usePEFirmData();

  if (firmLoading) {
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

  if (!firm) {
    return (
      <div className="p-6">
        <div className="text-center py-16">
          <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h2 className="text-xl font-semibold mb-2">Firm Not Found</h2>
          <p className="text-muted-foreground mb-4">
            This PE firm or sponsor record could not be found.
          </p>
          <Button asChild>
            <Link to="/admin/buyers">Back to All Buyers</Link>
          </Button>
        </div>
      </div>
    );
  }

  const hqLocation = [firm.hq_city, firm.hq_state].filter(Boolean).join(", ");

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Button variant="ghost" size="icon" asChild className="mt-1">
              <Link to="/admin/buyers?tab=private_equity">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>

            <div className="space-y-1">
              {/* Firm Name + Type Badge */}
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight">{firm.company_name}</h1>
                <Badge variant="outline" className="text-sm">
                  {getFirmTypeLabel(firm.buyer_type)}
                </Badge>
                {firm.has_fee_agreement && (
                  <Badge className="bg-green-100 text-green-800 border-green-200">
                    <FileSignature className="h-3 w-3 mr-1" />
                    Fee Agreement
                  </Badge>
                )}
                {firm.firm_agreement?.nda_signed && (
                  <Badge className="bg-blue-100 text-blue-800 border-blue-200">NDA Signed</Badge>
                )}
              </div>

              {/* Meta info row */}
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                {firm.company_website && (
                  <a
                    href={
                      firm.company_website.startsWith("http")
                        ? firm.company_website
                        : `https://${firm.company_website}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-primary transition-colors"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    <span>
                      {firm.company_website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                    </span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {firm.buyer_linkedin && (
                  <a
                    href={firm.buyer_linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-primary transition-colors"
                  >
                    <Linkedin className="h-3.5 w-3.5" />
                    <span>LinkedIn</span>
                  </a>
                )}
                {hqLocation && (
                  <div className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    <span>{hqLocation}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  <span>{platforms.length} Platform Companies</span>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <CreateTaskButton entityType="buyer" entityId={firm.id} entityName={firm.company_name} />
            <Button variant="outline" size="sm" onClick={() => navigate(`/admin/buyers/${firm.id}`)}>
              View as Buyer
            </Button>
          </div>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="platforms" className="space-y-4">
        <TabsList>
          <TabsTrigger value="platforms" className="text-sm">
            <Building2 className="mr-1.5 h-3.5 w-3.5" />
            Platform Companies ({platforms.length})
          </TabsTrigger>
          <TabsTrigger value="contacts" className="text-sm">
            <Users className="mr-1.5 h-3.5 w-3.5" />
            Contacts ({contacts.length})
          </TabsTrigger>
          <TabsTrigger value="intelligence" className="text-sm">
            <Brain className="mr-1.5 h-3.5 w-3.5" />
            Intelligence
          </TabsTrigger>
          <TabsTrigger value="deal-activity" className="text-sm">
            <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
            Deal Activity ({dealStats.totalScored})
          </TabsTrigger>
          <TabsTrigger value="notes-calls" className="text-sm">
            <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
            Notes & Calls ({transcripts.length})
          </TabsTrigger>
          <TabsTrigger value="agreements" className="text-sm">
            <FileSignature className="mr-1.5 h-3.5 w-3.5" />
            Agreements
          </TabsTrigger>
          <TabsTrigger value="tasks" className="text-sm">
            <ListChecks className="mr-1.5 h-3.5 w-3.5" />
            Tasks
          </TabsTrigger>
        </TabsList>

        <TabsContent value="platforms">
          <PlatformsTab
            firmName={firm.company_name!}
            platforms={platforms}
            platformsLoading={platformsLoading}
            onAddPlatform={() => setIsAddPlatformDialogOpen(true)}
          />
        </TabsContent>

        <TabsContent value="contacts">
          <ContactsTab
            firmName={firm.company_name!}
            contacts={contacts}
            onAddContact={() => setIsContactDialogOpen(true)}
            onDeleteContact={(contactId) => deleteContactMutation.mutate(contactId)}
          />
        </TabsContent>

        <TabsContent value="intelligence">
          <IntelligenceTab
            firm={firm}
            onUpdateFirm={(data) => updateFirmMutation.mutate(data)}
            onUpdateFirmAsync={(data) => updateFirmMutation.mutateAsync(data)}
          />
        </TabsContent>

        <TabsContent value="deal-activity">
          <DealActivityTab
            firmName={firm.company_name!}
            dealStats={dealStats}
            dealScores={dealScores}
            platforms={platforms}
          />
        </TabsContent>

        <TabsContent value="notes-calls">
          <NotesCallsTab
            firmId={firm.id}
            firmName={firm.company_name!}
            firmWebsite={firm.company_website}
            contacts={contacts}
            transcripts={transcripts}
            queryClient={queryClient}
          />
        </TabsContent>

        <TabsContent value="agreements">
          <BuyerAgreementsPanel
            buyerId={firm.id}
            marketplaceFirmId={firm.marketplace_firm_id || null}
            hasFeeAgreement={firm.has_fee_agreement || false}
            feeAgreementSource={firm.fee_agreement_source || null}
          />
        </TabsContent>

        <TabsContent value="tasks">
          <EntityTasksTab entityType="buyer" entityId={firm.id} entityName={firm.company_name} />
        </TabsContent>
      </Tabs>

      <AddContactDialog
        firmName={firm.company_name!}
        open={isContactDialogOpen}
        onOpenChange={setIsContactDialogOpen}
        newContact={newContact}
        setNewContact={setNewContact}
        onSubmit={() => addContactMutation.mutate()}
        isPending={addContactMutation.isPending}
      />

      <AddPlatformDialog
        firmName={firm.company_name!}
        open={isAddPlatformDialogOpen}
        onOpenChange={setIsAddPlatformDialogOpen}
        newPlatform={newPlatform}
        setNewPlatform={setNewPlatform}
        universes={universes}
        onSubmit={() => addPlatformMutation.mutate()}
        isPending={addPlatformMutation.isPending}
      />
    </div>
  );
};

export default PEFirmDetail;
