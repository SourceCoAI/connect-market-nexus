// Centralized Query Key Management
// This ensures consistent cache keys across the entire application

export const QUERY_KEYS = {
  // Auth & User related
  auth: ['auth'] as const,
  user: (userId?: string) => ['user', userId] as const,
  userProfile: (userId?: string) => ['user-profile', userId] as const,
  
  // Listings related
  listings: ['listings'] as const,
  listing: (listingId?: string) => ['listing', listingId] as const,
  
  // Saved listings - normalized keys
  savedListings: (filters?: Record<string, unknown>) => ['saved-listings', filters] as const,
  savedStatus: (listingId?: string) => ['saved-status', listingId] as const,
  
  // Connection requests - normalized keys  
  connectionRequests: ['connection-requests'] as const,
  connectionStatus: (listingId?: string) => ['connection-status', listingId] as const,
  userConnectionRequests: ['user-connection-requests'] as const,
  
  // Admin specific keys
  admin: {
    connectionRequests: ['admin', 'connection-requests'] as const,
    users: ['admin', 'users'] as const,
    listings: ['admin', 'listings'] as const,
    userSavedListings: (userId?: string) => ['admin', 'user-saved-listings', userId] as const,
    userConnectionRequests: (userId?: string) => ['admin', 'user-connection-requests', userId] as const,
    listingSavedBy: (listingId?: string) => ['admin', 'listing-saved-by', listingId] as const,
    userNotes: (userId?: string) => ['admin', 'user-notes', userId] as const,
  },
  
  // Firm agreements
  firmAgreements: ['firm-agreements'] as const,
  firmMembers: (firmId?: string) => ['firm-members', firmId] as const,

  // Agreement signing
  buyerNdaStatus: (userId?: string) => ['buyer-nda-status', userId] as const,
  myAgreementStatus: ['my-agreement-status'] as const,
  buyerFirmAgreementStatus: (userId?: string) => ['buyer-firm-agreement-status', userId] as const,
  agreementPendingNotifications: (userId?: string) => ['agreement-pending-notifications', userId] as const,
  buyerMessageThreads: (userId?: string) => ['buyer-message-threads', userId] as const,
  dealNdaStatus: (userId?: string) => ['deal-nda-status', userId] as const,
  
  // Deals & Pipeline
  deals: ['deals'] as const,
  deal: (dealId?: string) => ['deal', dealId] as const,
  
  // Analytics
  analytics: {
    health: ['analytics', 'health'] as const,
    marketplace: (days?: number) => ['analytics', 'marketplace', days] as const,
    feedback: (days?: number) => ['analytics', 'feedback', days] as const,
  },
} as const;

// Cache invalidation patterns - organized by feature
export const INVALIDATION_PATTERNS = {
  // Invalidate all saved listings related queries
  savedListings: () => [
    { queryKey: QUERY_KEYS.savedListings() },
    { queryKey: ['saved-listings'] }, // Legacy support
    { queryKey: ['saved-status'] }, // Legacy support
  ],
  
  // Invalidate all connection requests related queries
  connectionRequests: () => [
    { queryKey: QUERY_KEYS.connectionRequests },
    { queryKey: QUERY_KEYS.userConnectionRequests },
    { queryKey: QUERY_KEYS.admin.connectionRequests },
    { queryKey: ['connection-status'] }, // Legacy support
    { queryKey: ['user-connection-requests'] }, // Legacy support
    { queryKey: ['admin-connection-requests'] }, // Legacy support
  ],
  
  // Invalidate user-specific data
  userProfile: (userId?: string) => [
    { queryKey: QUERY_KEYS.userProfile(userId) },
    { queryKey: QUERY_KEYS.admin.users },
  ],
  
  // Invalidate user notes
  userNotes: (userId?: string) => [
    { queryKey: QUERY_KEYS.admin.userNotes(userId) },
    { queryKey: ['admin', 'user-notes'] },
  ],
  
  // Invalidate firm agreements
  firmAgreements: () => [
    { queryKey: QUERY_KEYS.firmAgreements },
    { queryKey: ['firm-agreements'] }, // Legacy support
  ],

  // Invalidate all agreement-related queries
  agreements: (userId?: string) => [
    { queryKey: QUERY_KEYS.myAgreementStatus },
    { queryKey: QUERY_KEYS.firmAgreements },
    { queryKey: QUERY_KEYS.buyerFirmAgreementStatus(userId) },
    { queryKey: QUERY_KEYS.agreementPendingNotifications(userId) },
    { queryKey: QUERY_KEYS.buyerNdaStatus(userId) },
    { queryKey: QUERY_KEYS.buyerMessageThreads(userId) },
  ],
  
  // Invalidate deals
  deals: () => [
    { queryKey: QUERY_KEYS.deals },
    { queryKey: ['deals'] }, // Legacy support
  ],
} as const;

// Helper function for safe query key generation
export const createQueryKey = {
  savedListings: (filters?: Record<string, unknown>) => QUERY_KEYS.savedListings(filters),
  savedStatus: (listingId?: string) => QUERY_KEYS.savedStatus(listingId),
  connectionStatus: (listingId?: string) => QUERY_KEYS.connectionStatus(listingId),
  userConnectionRequests: (userId?: string) => ['user-connection-requests', userId].filter(Boolean),
  userActivity: (userId?: string) => ['user-activity', userId].filter(Boolean),
  adminConnectionRequests: () => QUERY_KEYS.admin.connectionRequests,
} as const;