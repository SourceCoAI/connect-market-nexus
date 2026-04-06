import { ErrorBoundary } from "@/components/ErrorBoundary";
import { adminErrorHandler } from "@/lib/error-handler";
import { FormMonitoringTab } from "@/components/admin/form-monitoring/FormMonitoringTab";

const FormMonitoringPage = () => {
  return (
    <ErrorBoundary
      onError={(error) => {
        adminErrorHandler(error, "form monitoring loading");
      }}
    >
      <div className="min-h-screen bg-background">
        <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
          <div className="px-4 md:px-8 py-6">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">Form Monitoring</h1>
              <p className="text-sm text-muted-foreground">
                Monitor form submission health and track issues.
              </p>
            </div>
          </div>
        </div>

        <div className="px-8 py-8">
          <FormMonitoringTab />
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default FormMonitoringPage;
