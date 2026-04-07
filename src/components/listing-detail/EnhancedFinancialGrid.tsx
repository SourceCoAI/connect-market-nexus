import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface FinancialGridMetric {
  label: string;
  value: string;
  subtitle?: string;
  tooltip?: string;
}

interface EnhancedFinancialGridProps {
  metrics: FinancialGridMetric[];
}

export function EnhancedFinancialGrid({ metrics }: EnhancedFinancialGridProps) {
  return (
    <TooltipProvider>
      <div className={`grid gap-4 sm:gap-8 border-b border-border/30 pb-2 ${metrics.length >= 4 ? 'grid-cols-2 sm:grid-cols-4' : metrics.length === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'}`}>
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="space-y-2"
          >
            {/* Label with tooltip */}
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  {metric.label}
                </p>
                {metric.tooltip && (
                  <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                      <button className="inline-flex items-center justify-center rounded-full p-0.5 hover:bg-gray-100 transition-colors">
                        <Info className="w-3 h-3 text-gray-400 hover:text-gray-600 flex-shrink-0" strokeWidth={2} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent 
                      side="top" 
                      align="center"
                      sideOffset={8}
                      className="max-w-sm bg-gray-900 text-white border-gray-800 p-4"
                    >
                      <div className="space-y-2.5 text-xs leading-relaxed">
                        <p className="font-semibold text-white">
                          Off-Market Deal
                        </p>
                        <p className="text-gray-200">
                          {metric.tooltip}
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              
              {/* Value */}
              <p className="text-2xl font-light text-foreground">{metric.value}</p>
              
              {/* Subtitle */}
              {metric.subtitle && (
                <p className="text-xs text-muted-foreground">{metric.subtitle}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
}
