import { ErrorBoundary } from "@/components/ErrorBoundary";
import { adminErrorHandler } from "@/lib/error-handler";
import { DataRecoveryTab } from "@/components/admin/data-recovery/DataRecoveryTab";
import { useAdmin } from "@/hooks/use-admin";

const DataRecoveryPage = () => {
  const { users } = useAdmin();
  const { data: usersData = [] } = users;

  return (
    <ErrorBoundary
      onError={(error) => {
        adminErrorHandler(error, "data recovery loading");
      }}
    >
      <div className="min-h-screen bg-background">
        <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
          <div className="px-4 md:px-8 py-6">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">Data Recovery</h1>
              <p className="text-sm text-muted-foreground">
                System maintenance and data recovery tools.
              </p>
            </div>
          </div>
        </div>

        <div className="px-8 py-8">
          <DataRecoveryTab users={usersData} />
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default DataRecoveryPage;
