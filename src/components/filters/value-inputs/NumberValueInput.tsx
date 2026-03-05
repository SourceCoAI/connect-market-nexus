import { NumericInput } from '@/components/ui/numeric-input';

type NumberValue = number | string | { min?: number | string; max?: number | string } | null;

interface NumberValueInputProps {
  value: NumberValue;
  onChange: (value: NumberValue) => void;
  dual?: boolean;
  isCurrency?: boolean;
  placeholder?: string;
}

function formatDisplay(val: string, isCurrency: boolean): string {
  if (!val) return '';
  const num = Number(val.replace(/[^0-9.-]/g, ''));
  if (isNaN(num)) return val;
  if (isCurrency) return num.toLocaleString();
  return val;
}
void formatDisplay;

export function NumberValueInput({
  value,
  onChange,
  dual,
  isCurrency,
  placeholder,
}: NumberValueInputProps) {
  if (dual) {
    const rangeValue = (typeof value === 'object' && value !== null ? value : {}) as {
      min?: number | string;
      max?: number | string;
    };
    const min = rangeValue.min ?? '';
    const max = rangeValue.max ?? '';
    return (
      <div className="flex items-center gap-1.5">
        <NumericInput
          value={min}
          onChange={(val) => onChange({ min: val, max })}
          placeholder={isCurrency ? '$min' : 'min'}
          className="h-8 text-sm w-[90px]"
        />
        <span className="text-xs text-muted-foreground">and</span>
        <NumericInput
          value={max}
          onChange={(val) => onChange({ min, max: val })}
          placeholder={isCurrency ? '$max' : 'max'}
          className="h-8 text-sm w-[90px]"
        />
      </div>
    );
  }

  return (
    <div className="relative">
      {isCurrency && (
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          $
        </span>
      )}
      <NumericInput
        value={typeof value === 'string' || typeof value === 'number' ? value : ''}
        onChange={(val) => onChange(val)}
        placeholder={placeholder ?? (isCurrency ? '0' : 'value')}
        className={`h-8 text-sm w-[130px] ${isCurrency ? 'pl-6' : ''}`}
      />
    </div>
  );
}
