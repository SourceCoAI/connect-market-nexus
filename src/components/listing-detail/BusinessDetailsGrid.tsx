import { MapPin, Wrench, Building2, Users, TrendingUp, DollarSign, Briefcase } from 'lucide-react';

interface BusinessDetailsGridProps {
  geographic_states?: string[] | null;
  services?: string[] | null;
  number_of_locations?: number | null;
  customer_types?: string | null;
  revenue_model?: string | null;
  business_model?: string | null;
  growth_trajectory?: string | null;
}

export function BusinessDetailsGrid({
  geographic_states,
  services,
  number_of_locations,
  customer_types,
  revenue_model,
  business_model,
  growth_trajectory,
}: BusinessDetailsGridProps) {
  const hasAnyData =
    (geographic_states && geographic_states.length > 0) ||
    (services && services.length > 0) ||
    number_of_locations ||
    customer_types ||
    revenue_model ||
    business_model ||
    growth_trajectory;

  if (!hasAnyData) return null;

  return (
    <div className="py-8 border-t border-slate-100 space-y-5">
      <h3 className="text-sm font-medium text-foreground">Business Details</h3>
      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
        {/* Geography */}
        {geographic_states && geographic_states.length > 0 && (
          <div className="flex items-start gap-3">
            <MapPin className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1.5">
                Geography
              </p>
              <div className="flex flex-wrap gap-1.5">
                {geographic_states.map((state) => (
                  <span
                    key={state}
                    className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-xs font-medium text-slate-700"
                  >
                    {state}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Services */}
        {services && services.length > 0 && (
          <div className="flex items-start gap-3">
            <Wrench className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1.5">
                Services
              </p>
              <div className="flex flex-wrap gap-1.5">
                {services.map((service) => (
                  <span
                    key={service}
                    className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-xs font-medium text-slate-700"
                  >
                    {service}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Number of Locations */}
        {number_of_locations != null && number_of_locations > 0 && (
          <div className="flex items-start gap-3">
            <Building2 className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1.5">
                Locations
              </p>
              <p className="text-sm text-foreground">{number_of_locations}</p>
            </div>
          </div>
        )}

        {/* Customer Types */}
        {customer_types && (
          <div className="flex items-start gap-3">
            <Users className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1.5">
                Customer Types
              </p>
              <p className="text-sm text-foreground">{customer_types}</p>
            </div>
          </div>
        )}

        {/* Revenue Model */}
        {revenue_model && (
          <div className="flex items-start gap-3">
            <DollarSign className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1.5">
                Revenue Model
              </p>
              <p className="text-sm text-foreground">{revenue_model}</p>
            </div>
          </div>
        )}

        {/* Business Model */}
        {business_model && (
          <div className="flex items-start gap-3">
            <Briefcase className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1.5">
                Business Model
              </p>
              <p className="text-sm text-foreground">{business_model}</p>
            </div>
          </div>
        )}

        {/* Growth Trajectory */}
        {growth_trajectory && (
          <div className="flex items-start gap-3">
            <TrendingUp className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1.5">
                Growth Trajectory
              </p>
              <p className="text-sm text-foreground">{growth_trajectory}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
