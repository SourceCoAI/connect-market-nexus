import { useState, useEffect, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import { UnifiedAdminSidebar } from './UnifiedAdminSidebar';
import { AdminNavbar } from './AdminNavbar';
import { AICommandCenterProvider } from '@/components/ai-command-center';
import { UniversalSearchDialog } from './UniversalSearchDialog';
import PageErrorBoundary from './PageErrorBoundary';

const AdminLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Cmd+K / Ctrl+K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const openSearch = useCallback(() => setSearchOpen(true), []);

  return (
    <AICommandCenterProvider>
      <div className="flex min-h-screen w-full bg-background">
        {/* Sidebar - hidden on mobile, fixed width on desktop */}
        <aside
          className={`hidden md:flex flex-col flex-shrink-0 h-screen sticky top-0 border-r border-border bg-card transition-all duration-200 ${
            collapsed ? 'w-16' : 'w-56'
          }`}
        >
          <UnifiedAdminSidebar
            collapsed={collapsed}
            onCollapsedChange={setCollapsed}
            onSearchClick={openSearch}
          />
        </aside>

        <div className="flex flex-col flex-1 min-w-0">
          {/* Mobile nav */}
          <AdminNavbar className="md:hidden" onSearchClick={openSearch} />

          {/* Main content */}
          <main className="flex-1 overflow-auto w-full bg-background/50">
            <div className="p-4 lg:p-6">
              <PageErrorBoundary>
                <Outlet />
              </PageErrorBoundary>
            </div>
          </main>
        </div>
      </div>

      <UniversalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </AICommandCenterProvider>
  );
};

export default AdminLayout;
