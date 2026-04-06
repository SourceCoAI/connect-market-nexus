import { Eye, Lock, Shield } from 'lucide-react';
import { EDITOR_DESIGN } from '@/lib/editor-design-system';
import { cn } from '@/lib/utils';

/**
 * Compact panel explaining what data is visible to whom.
 * Reflects actual platform gating behavior.
 */
export function EditorVisibilityPanel() {
  return (
    <div
      className={cn(
        EDITOR_DESIGN.cardBg,
        EDITOR_DESIGN.cardBorder,
        'rounded-lg',
        EDITOR_DESIGN.cardPadding,
      )}
    >
      <div className={cn(EDITOR_DESIGN.microHeader, 'mb-4')}>Visibility Rules</div>
      <div className="space-y-4">
        {/* Admin Only */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Lock className="h-3 w-3 text-muted-foreground" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Admin Only
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground/80 leading-relaxed pl-[18px]">
            Company name, CRM links, internal notes, contact info, deal owner, source deal linkage.
          </p>
        </div>

        {/* Browsing Buyers */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Eye className="h-3 w-3 text-foreground/60" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
              Marketplace (All Buyers)
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground/80 leading-relaxed pl-[18px]">
            Title, image, description, hero text, categories, location, services, states,
            number of locations, customer types, revenue model, business model, growth trajectory.
          </p>
        </div>

        {/* After Connection Approval */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Shield className="h-3 w-3 text-primary/60" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-primary/60">
              After Approval
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground/80 leading-relaxed pl-[18px]">
            Revenue, EBITDA, margins, team size, custom metrics, data room documents (CIM, teaser, full memo).
          </p>
        </div>
      </div>
    </div>
  );
}
