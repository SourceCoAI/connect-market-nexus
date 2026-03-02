import { Route, Navigate, useParams } from 'react-router-dom';
import { lazyWithRetry } from '@/lib/lazy-with-retry';
import ProtectedRoute from '@/components/ProtectedRoute';
import { RoleGate } from '@/components/admin/RoleGate';

// Admin layout
const AdminLayout = lazyWithRetry(() => import('@/components/admin/AdminLayout'));

// Admin pages
const AdminDashboard = lazyWithRetry(() => import('@/pages/admin/AdminDashboard'));
const DailyTaskDashboard = lazyWithRetry(
  () => import('@/pages/admin/remarketing/DailyTaskDashboard'),
);
const DailyTaskAnalytics = lazyWithRetry(
  () => import('@/pages/admin/remarketing/DailyTaskAnalytics'),
);
const MarketplaceUsersPage = lazyWithRetry(() => import('@/pages/admin/AdminUsers'));
const InternalTeamPage = lazyWithRetry(() => import('@/pages/admin/InternalTeamPage'));
const BuyerContactsPage = lazyWithRetry(() => import('@/pages/admin/BuyerContactsPage'));
const ContactListsPage = lazyWithRetry(() => import('@/pages/admin/ContactListsPage'));
const ContactListDetailPage = lazyWithRetry(() => import('@/pages/admin/ContactListDetailPage'));
const OwnerLeadsPage = lazyWithRetry(() => import('@/pages/admin/OwnerLeadsPage'));
const AdminRequests = lazyWithRetry(() => import('@/pages/admin/AdminRequests'));
const AdminDealSourcing = lazyWithRetry(() => import('@/pages/admin/AdminDealSourcing'));
const AdminPipeline = lazyWithRetry(() => import('@/pages/admin/AdminPipeline'));
const AdminNotifications = lazyWithRetry(() => import('@/pages/admin/AdminNotifications'));
const WebhooksPage = lazyWithRetry(() => import('@/pages/admin/settings/WebhooksPage'));
const TranscriptAnalytics = lazyWithRetry(
  () => import('@/pages/admin/analytics/TranscriptAnalytics'),
);
const WebsiteAnalytics = lazyWithRetry(() => import('@/pages/admin/analytics/WebsiteAnalytics'));
const EnrichmentTest = lazyWithRetry(() => import('@/pages/admin/EnrichmentTest'));
const EnrichmentQueue = lazyWithRetry(() => import('@/pages/admin/EnrichmentQueue'));
const DataRecoveryPage = lazyWithRetry(() => import('@/pages/admin/DataRecoveryPage'));
const FormMonitoringPage = lazyWithRetry(() => import('@/pages/admin/FormMonitoringPage'));
const SecuritySettings = lazyWithRetry(() => import('@/pages/admin/settings/SecuritySettings'));
const GlobalApprovalsPage = lazyWithRetry(() => import('@/pages/admin/GlobalApprovalsPage'));
const SystemTestRunner = lazyWithRetry(() => import('@/pages/admin/SystemTestRunner'));
const DocuSealHealthCheck = lazyWithRetry(() => import('@/pages/admin/DocuSealHealthCheck'));
const SystemStatus = lazyWithRetry(() => import('@/pages/admin/SystemStatus'));
const MessageCenter = lazyWithRetry(() => import('@/pages/admin/MessageCenter'));

// Smartlead pages
const SmartleadCampaignsPage = lazyWithRetry(() => import('@/pages/admin/SmartleadCampaignsPage'));
const SmartleadSettingsPage = lazyWithRetry(
  () => import('@/pages/admin/settings/SmartleadSettingsPage'),
);

// Create listing from deal
const CreateListingFromDeal = lazyWithRetry(() => import('@/pages/admin/CreateListingFromDeal'));

// ReMarketing pages
const ReMarketingLayout = lazyWithRetry(() =>
  import('@/components/remarketing').then((m) => ({ default: m.ReMarketingLayout })),
);
const ReMarketingDashboard = lazyWithRetry(
  () => import('@/pages/admin/remarketing/ReMarketingDashboard'),
);
const ReMarketingUniverses = lazyWithRetry(
  () => import('@/pages/admin/remarketing/ReMarketingUniverses'),
);
const ReMarketingUniverseDetail = lazyWithRetry(
  () => import('@/pages/admin/remarketing/ReMarketingUniverseDetail'),
);
const ReMarketingDeals = lazyWithRetry(() => import('@/pages/admin/remarketing/ReMarketingDeals'));
const ReMarketingDealDetail = lazyWithRetry(
  () => import('@/pages/admin/remarketing/ReMarketingDealDetail'),
);
const ReMarketingBuyers = lazyWithRetry(
  () => import('@/pages/admin/remarketing/ReMarketingBuyers'),
);
const ReMarketingBuyerDetail = lazyWithRetry(
  () => import('@/pages/admin/remarketing/ReMarketingBuyerDetail'),
);
const PEFirmDetail = lazyWithRetry(() => import('@/pages/admin/remarketing/PEFirmDetail'));
const ReMarketingDealMatching = lazyWithRetry(
  () => import('@/pages/admin/remarketing/ReMarketingDealMatching'),
);
const ReMarketingIntroductions = lazyWithRetry(
  () => import('@/pages/admin/remarketing/ReMarketingIntroductions'),
);
const ReMarketingAnalytics = lazyWithRetry(
  () => import('@/pages/admin/remarketing/ReMarketingAnalytics'),
);
const ReMarketingSettings = lazyWithRetry(
  () => import('@/pages/admin/remarketing/ReMarketingSettings'),
);
const ReMarketingActivityQueue = lazyWithRetry(
  () => import('@/pages/admin/remarketing/ReMarketingActivityQueue'),
);
const ReMarketingReferralPartners = lazyWithRetry(
  () => import('@/pages/admin/remarketing/ReMarketingReferralPartners'),
);
const ReMarketingReferralPartnerDetail = lazyWithRetry(
  () => import('@/pages/admin/remarketing/ReMarketingReferralPartnerDetail'),
);
const CapTargetDeals = lazyWithRetry(() => import('@/pages/admin/remarketing/CapTargetDeals'));
const GPPartnerDeals = lazyWithRetry(() => import('@/pages/admin/remarketing/GPPartnerDeals'));
const ValuationLeads = lazyWithRetry(() => import('@/pages/admin/remarketing/ValuationLeads'));

function RedirectWithId({ to }: { to: string }) {
  const params = useParams();
  const resolved = to.replace(/:(\w+)/g, (_, key) => params[key] ?? key);
  return <Navigate to={resolved} replace />;
}

export function AdminRoutes() {
  return (
    <Route
      path="/admin"
      element={
        <ProtectedRoute requireAdmin={true}>
          <AdminLayout />
        </ProtectedRoute>
      }
    >
      {/* Dashboard */}
      <Route index element={<AdminDashboard />} />

      {/* DEALS */}
      <Route path="deals" element={<ReMarketingDeals />} />
      <Route path="deals/:dealId" element={<ReMarketingDealDetail />} />
      <Route
        path="deals/pipeline"
        element={
          <RoleGate min="admin">
            <AdminPipeline />
          </RoleGate>
        }
      />

      {/* BUYERS */}
      <Route path="buyers" element={<ReMarketingBuyers />} />
      <Route path="buyers/pe-firms" element={<Navigate to="/admin/buyers?tab=pe_firm" replace />} />
      <Route path="buyers/pe-firms/:id" element={<PEFirmDetail />} />
      <Route path="buyers/:id" element={<ReMarketingBuyerDetail />} />
      <Route
        path="buyers/universes"
        element={
          <RoleGate min="admin">
            <ReMarketingUniverses />
          </RoleGate>
        }
      />
      <Route
        path="buyers/universes/:id"
        element={
          <RoleGate min="admin">
            <ReMarketingUniverseDetail />
          </RoleGate>
        }
      />
      <Route
        path="buyers/firm-agreements"
        element={<Navigate to="/admin/buyers?tab=needs_agreements" replace />}
      />
      <Route path="buyers/deal-sourcing" element={<AdminDealSourcing />} />
      <Route path="buyers/contacts" element={<BuyerContactsPage />} />

      {/* CONTACT LISTS */}
      <Route path="lists" element={<ContactListsPage />} />
      <Route path="lists/:id" element={<ContactListDetailPage />} />

      {/* MARKETPLACE */}
      <Route path="marketplace/create-listing" element={<CreateListingFromDeal />} />
      <Route
        path="marketplace/listings"
        element={<Navigate to="/admin/deals?tab=marketplace" replace />}
      />
      <Route path="marketplace/requests" element={<AdminRequests />} />
      <Route path="marketplace/messages" element={<MessageCenter />} />
      <Route path="marketplace/users" element={<MarketplaceUsersPage />} />

      {/* REMARKETING */}
      <Route
        path="remarketing"
        element={
          <RoleGate min="admin">
            <ReMarketingLayout />
          </RoleGate>
        }
      >
        <Route index element={<ReMarketingDashboard />} />
        <Route path="activity-queue" element={<ReMarketingActivityQueue />} />
        <Route path="leads/captarget" element={<CapTargetDeals />} />
        <Route path="leads/captarget/:dealId" element={<ReMarketingDealDetail />} />
        <Route path="leads/gp-partners" element={<GPPartnerDeals />} />
        <Route path="leads/gp-partners/:dealId" element={<ReMarketingDealDetail />} />
        <Route path="leads/valuation" element={<ValuationLeads />} />
        <Route path="leads/referrals" element={<ReMarketingReferralPartners />} />
        <Route path="leads/referrals/:partnerId" element={<ReMarketingReferralPartnerDetail />} />
        <Route path="matching/:listingId" element={<ReMarketingDealMatching />} />
        <Route path="introductions/:listingId" element={<ReMarketingIntroductions />} />

        {/* Old remarketing URL redirects */}
        <Route path="deals" element={<Navigate to="/admin/deals" replace />} />
        <Route path="deals/:dealId" element={<RedirectWithId to="/admin/deals/:dealId" />} />
        <Route path="buyers" element={<Navigate to="/admin/buyers" replace />} />
        <Route path="buyers/:id" element={<RedirectWithId to="/admin/buyers/:id" />} />
        <Route path="universes" element={<Navigate to="/admin/buyers/universes" replace />} />
        <Route path="universes/:id" element={<RedirectWithId to="/admin/buyers/universes/:id" />} />
        <Route path="analytics" element={<Navigate to="/admin/analytics" replace />} />
        <Route path="settings" element={<Navigate to="/admin/settings/remarketing" replace />} />
        <Route
          path="captarget-deals"
          element={<Navigate to="/admin/remarketing/leads/captarget" replace />}
        />
        <Route
          path="captarget-deals/:dealId"
          element={<RedirectWithId to="/admin/remarketing/leads/captarget/:dealId" />}
        />
        <Route
          path="gp-partner-deals"
          element={<Navigate to="/admin/remarketing/leads/gp-partners" replace />}
        />
        <Route
          path="gp-partner-deals/:dealId"
          element={<RedirectWithId to="/admin/remarketing/leads/gp-partners/:dealId" />}
        />
        <Route
          path="valuation-leads"
          element={<Navigate to="/admin/remarketing/leads/valuation" replace />}
        />
        <Route
          path="referral-partners"
          element={<Navigate to="/admin/remarketing/leads/referrals" replace />}
        />
        <Route
          path="referral-partners/:partnerId"
          element={<RedirectWithId to="/admin/remarketing/leads/referrals/:partnerId" />}
        />
      </Route>

      {/* SMARTLEAD */}
      <Route
        path="smartlead/campaigns"
        element={
          <RoleGate min="admin">
            <SmartleadCampaignsPage />
          </RoleGate>
        }
      />
      <Route
        path="smartlead/settings"
        element={
          <RoleGate min="admin">
            <SmartleadSettingsPage />
          </RoleGate>
        }
      />

      {/* APPROVALS */}
      <Route
        path="approvals"
        element={
          <RoleGate min="admin">
            <GlobalApprovalsPage />
          </RoleGate>
        }
      />

      {/* DAILY TASKS */}
      <Route path="daily-tasks" element={<DailyTaskDashboard />} />
      <Route path="daily-tasks/analytics" element={<DailyTaskAnalytics />} />

      {/* ANALYTICS */}
      <Route path="analytics" element={<Navigate to="/admin/analytics/website" replace />} />
      <Route path="analytics/website" element={<WebsiteAnalytics />} />
      <Route path="analytics/remarketing" element={<ReMarketingAnalytics />} />
      <Route path="analytics/transcripts" element={<TranscriptAnalytics />} />

      {/* ADMIN / SETTINGS */}
      <Route path="settings" element={<Navigate to="/admin/settings/team" replace />} />
      <Route
        path="settings/team"
        element={
          <RoleGate min="admin">
            <InternalTeamPage />
          </RoleGate>
        }
      />
      <Route path="settings/owner-leads" element={<OwnerLeadsPage />} />
      <Route path="settings/notifications" element={<AdminNotifications />} />
      <Route
        path="settings/webhooks"
        element={
          <RoleGate min="admin">
            <WebhooksPage />
          </RoleGate>
        }
      />
      <Route
        path="settings/enrichment-queue"
        element={
          <RoleGate min="admin">
            <EnrichmentQueue />
          </RoleGate>
        }
      />
      <Route
        path="settings/enrichment-test"
        element={
          <RoleGate min="admin">
            <EnrichmentTest />
          </RoleGate>
        }
      />
      <Route
        path="settings/remarketing"
        element={
          <RoleGate min="admin">
            <ReMarketingSettings />
          </RoleGate>
        }
      />
      <Route
        path="settings/data-recovery"
        element={
          <RoleGate min="owner">
            <DataRecoveryPage />
          </RoleGate>
        }
      />
      <Route
        path="settings/form-monitoring"
        element={
          <RoleGate min="admin">
            <FormMonitoringPage />
          </RoleGate>
        }
      />
      <Route
        path="settings/security"
        element={
          <RoleGate min="admin">
            <SecuritySettings />
          </RoleGate>
        }
      />
      <Route
        path="system-test"
        element={
          <RoleGate min="owner">
            <SystemTestRunner />
          </RoleGate>
        }
      />
      <Route
        path="system-status"
        element={
          <RoleGate min="admin">
            <SystemStatus />
          </RoleGate>
        }
      />
      <Route
        path="docuseal-health"
        element={
          <RoleGate min="admin">
            <DocuSealHealthCheck />
          </RoleGate>
        }
      />

      {/* OLD ADMIN URL REDIRECTS */}
      <Route path="listings" element={<Navigate to="/admin/deals?tab=marketplace" replace />} />
      <Route path="users" element={<Navigate to="/admin/marketplace/users" replace />} />
      <Route
        path="firm-agreements"
        element={<Navigate to="/admin/buyers?tab=needs_agreements" replace />}
      />
      <Route path="requests" element={<Navigate to="/admin/marketplace/requests" replace />} />
      <Route path="deal-sourcing" element={<Navigate to="/admin/buyers/deal-sourcing" replace />} />
      <Route path="pipeline" element={<Navigate to="/admin/deals/pipeline" replace />} />
      <Route
        path="notifications"
        element={<Navigate to="/admin/settings/notifications" replace />}
      />
      <Route
        path="enrichment-test"
        element={<Navigate to="/admin/settings/enrichment-test" replace />}
      />
    </Route>
  );
}
