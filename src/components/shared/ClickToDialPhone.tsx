import { useState } from 'react';
import { Phone } from 'lucide-react';
import { PushToDialerModal } from '@/components/remarketing/PushToDialerModal';
import { cn } from '@/lib/utils';

interface ClickToDialPhoneProps {
  phone: string;
  name?: string;
  email?: string;
  company?: string;
  entityType?: 'buyer_contacts' | 'contacts' | 'buyers' | 'listings' | 'leads' | 'contact_list';
  entityId?: string;
  /** Display label — defaults to the phone number */
  label?: string;
  /** If true, show only an icon button */
  iconOnly?: boolean;
  className?: string;
  size?: 'xs' | 'sm' | 'md';
}

/**
 * Clickable phone number that opens the Push to PhoneBurner modal
 * to initiate a dial session with account selection.
 */
export function ClickToDialPhone({
  phone,
  entityType,
  entityId,
  label,
  iconOnly = false,
  className,
  size = 'sm',
}: ClickToDialPhoneProps) {
  const [dialerOpen, setDialerOpen] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDialerOpen(true);
  };

  const sizeClasses = {
    xs: 'text-[10px] gap-0.5',
    sm: 'text-xs gap-1',
    md: 'text-sm gap-1.5',
  };

  const iconSizes = {
    xs: 'h-2.5 w-2.5',
    sm: 'h-3 w-3',
    md: 'h-3.5 w-3.5',
  };

  // Map entityType to the dialer modal's expected type
  const dialerEntityType = entityType || 'contacts';

  // Use entityId if available, otherwise fall back to phone as identifier
  const contactIds = entityId ? [entityId] : [];

  return (
    <>
      {iconOnly ? (
        <button
          type="button"
          onClick={handleClick}
          title={`Call ${phone}`}
          className={cn(
            'inline-flex items-center justify-center rounded-md p-1 text-green-700 hover:bg-green-50 transition-colors',
            className,
          )}
        >
          <Phone className={iconSizes[size]} />
        </button>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          title={`Call ${phone} via PhoneBurner`}
          className={cn(
            'inline-flex items-center font-medium text-green-700 hover:text-green-900 transition-colors',
            sizeClasses[size],
            className,
          )}
        >
          <Phone className={iconSizes[size]} />
          {label ?? phone}
        </button>
      )}

      <PushToDialerModal
        open={dialerOpen}
        onOpenChange={setDialerOpen}
        contactIds={contactIds}
        contactCount={1}
        entityType={dialerEntityType}
      />
    </>
  );
}
