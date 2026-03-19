import { Phone, Loader2 } from 'lucide-react';
import { useQuickDial } from '@/hooks/admin/use-quick-dial';
import { cn } from '@/lib/utils';

interface ClickToDialPhoneProps {
  phone: string;
  name?: string;
  email?: string;
  company?: string;
  entityType?: 'buyer_contacts' | 'contacts' | 'buyers';
  entityId?: string;
  /** Display label — defaults to the phone number */
  label?: string;
  /** If true, show only an icon button */
  iconOnly?: boolean;
  className?: string;
  size?: 'xs' | 'sm' | 'md';
}

/**
 * Clickable phone number that launches a PhoneBurner dial session.
 * Falls back to a `tel:` link if PhoneBurner is unavailable.
 */
export function ClickToDialPhone({
  phone,
  name,
  email,
  company,
  entityType,
  entityId,
  label,
  iconOnly = false,
  className,
  size = 'sm',
}: ClickToDialPhoneProps) {
  const { dial, isDialing } = useQuickDial();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dial({ phone, name, email, company, entityType, entityId });
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

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={isDialing}
        title={`Call ${phone}`}
        className={cn(
          'inline-flex items-center justify-center rounded-md p-1 text-green-700 hover:bg-green-50 transition-colors disabled:opacity-50',
          className,
        )}
      >
        {isDialing ? (
          <Loader2 className={cn(iconSizes[size], 'animate-spin')} />
        ) : (
          <Phone className={iconSizes[size]} />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isDialing}
      title={`Call ${phone} via PhoneBurner`}
      className={cn(
        'inline-flex items-center font-medium text-green-700 hover:text-green-900 transition-colors disabled:opacity-50',
        sizeClasses[size],
        className,
      )}
    >
      {isDialing ? (
        <Loader2 className={cn(iconSizes[size], 'animate-spin')} />
      ) : (
        <Phone className={iconSizes[size]} />
      )}
      {label ?? phone}
    </button>
  );
}
