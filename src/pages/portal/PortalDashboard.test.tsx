import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PortalDashboard from './PortalDashboard';

// Mock hooks used inside the component
vi.mock('@/hooks/portal/use-portal-users', () => ({
  useMyPortalUser: vi.fn(),
}));
vi.mock('@/hooks/portal/use-portal-deals', () => ({
  useMyPortalDeals: vi.fn(),
}));
vi.mock('@/hooks/portal/use-portal-messages', () => ({
  usePortalMessageSummaries: vi.fn(),
}));

import { useMyPortalUser } from '@/hooks/portal/use-portal-users';
import { useMyPortalDeals } from '@/hooks/portal/use-portal-deals';
import { usePortalMessageSummaries } from '@/hooks/portal/use-portal-messages';

const LOADED_USER = {
  id: 'admin-preview-test',
  portal_org_id: 'org-1',
  profile_id: 'user-1',
  contact_id: null,
  role: 'admin',
  email: 'a@b.com',
  name: 'Admin Preview',
  is_active: true,
  last_login_at: null,
  invite_sent_at: null,
  invite_accepted_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  portal_org: {
    id: 'org-1',
    name: 'Test Portal',
    portal_slug: 'test',
    welcome_message: null,
  },
};

function renderWithRouter() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/portal/test']}>
        <Routes>
          <Route path="/portal/:slug" element={<PortalDashboard />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PortalDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Regression test: previously useState for the modal was declared after the
  // early returns, which violated the Rules of Hooks and crashed the portal
  // preview route once data loaded.
  it('transitions from loading to loaded without a hooks violation', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mockedUser = vi.mocked(useMyPortalUser);
    const mockedDeals = vi.mocked(useMyPortalDeals);
    const mockedMsgs = vi.mocked(usePortalMessageSummaries);

    mockedUser.mockReturnValue({
      data: undefined,
      isLoading: true,
      status: 'pending',
    } as unknown as ReturnType<typeof useMyPortalUser>);
    mockedDeals.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useMyPortalDeals>);
    mockedMsgs.mockReturnValue({
      data: undefined,
    } as unknown as ReturnType<typeof usePortalMessageSummaries>);

    const { rerender } = renderWithRouter();
    expect(screen.getByText(/loading portal/i)).toBeInTheDocument();

    // Flip the mocks and rerender the SAME tree — this is the key scenario
    // the old bug crashed on: same instance, hook count changes across renders.
    mockedUser.mockReturnValue({
      data: LOADED_USER,
      isLoading: false,
      status: 'success',
    } as unknown as ReturnType<typeof useMyPortalUser>);
    mockedDeals.mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useMyPortalDeals>);
    mockedMsgs.mockReturnValue({
      data: {},
    } as unknown as ReturnType<typeof usePortalMessageSummaries>);

    await act(async () => {
      rerender(
        <QueryClientProvider
          client={
            new QueryClient({
              defaultOptions: { queries: { retry: false, gcTime: 0 } },
            })
          }
        >
          <MemoryRouter initialEntries={['/portal/test']}>
            <Routes>
              <Route path="/portal/:slug" element={<PortalDashboard />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Test Portal')).toBeInTheDocument();
    });

    // Fail loudly if React detected a Rules of Hooks violation.
    const hooksWarning = errorSpy.mock.calls.find((args) =>
      String(args[0] ?? '').includes('change in the order of Hooks'),
    );
    expect(hooksWarning).toBeUndefined();
    errorSpy.mockRestore();
  });

  it('renders a deal list without crashing', async () => {
    const mockedUser = vi.mocked(useMyPortalUser);
    const mockedDeals = vi.mocked(useMyPortalDeals);
    const mockedMsgs = vi.mocked(usePortalMessageSummaries);

    mockedUser.mockReturnValue({
      data: {
        id: 'admin-preview-test',
        portal_org_id: 'org-1',
        profile_id: 'user-1',
        contact_id: null,
        role: 'admin',
        email: 'a@b.com',
        name: 'Admin Preview',
        is_active: true,
        last_login_at: null,
        invite_sent_at: null,
        invite_accepted_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        portal_org: {
          id: 'org-1',
          name: 'Test Portal',
          portal_slug: 'test',
          welcome_message: null,
        },
      },
      isLoading: false,
      status: 'success',
    } as unknown as ReturnType<typeof useMyPortalUser>);
    mockedDeals.mockReturnValue({
      data: [
        {
          id: 'push-1',
          status: 'pending_review',
          priority: 'standard',
          created_at: new Date().toISOString(),
          deal_snapshot: {
            headline: 'Test Deal',
            industry: 'SaaS',
            geography: 'TX',
          },
        },
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof useMyPortalDeals>);
    mockedMsgs.mockReturnValue({
      data: {},
    } as unknown as ReturnType<typeof usePortalMessageSummaries>);

    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText('Test Deal')).toBeInTheDocument();
    });
  });
});
