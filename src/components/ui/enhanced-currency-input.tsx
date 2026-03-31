import React, { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface EnhancedCurrencyInputProps extends Omit<React.ComponentProps<"input">, "onChange" | "value"> {
  value?: string;
  onChange?: (value: string) => void;
  currencyMode?: 'millions' | 'thousands' | 'auto';
  fieldType?: 'fund' | 'revenue' | 'aum' | 'dealSize' | 'general';
  showSuffix?: boolean;
}

const formatCurrency = (value: string, _mode: 'millions' | 'thousands' | 'auto'): string => {
  // Remove all non-digit characters
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  
  const num = parseInt(digits);
  
  // Add commas as thousand separators
  return num.toLocaleString();
};

const getSuffix = (_mode: 'millions' | 'thousands' | 'auto', fieldType: string): string => {
  if (fieldType === 'fund' || fieldType === 'aum') return '$M';
  if (fieldType === 'revenue') return '$M';
  if (fieldType === 'dealSize') return '$M';
  return '$M'; // Default to millions for financial fields
};

const getPlaceholder = (fieldType: string): string => {
  switch (fieldType) {
    case 'fund':
      return 'e.g. 500';
    case 'aum':
      return 'e.g. 1000';
    case 'revenue':
      return 'e.g. 25';
    case 'dealSize':
      return 'e.g. 10';
    default:
      return 'Enter amount';
  }
};

export const EnhancedCurrencyInput = React.forwardRef<HTMLInputElement, EnhancedCurrencyInputProps>(
  ({ 
    className, 
    value = "", 
    onChange, 
    onBlur, 
    currencyMode = 'millions', 
    fieldType = 'general',
    showSuffix = true,
    placeholder,
    ...props 
  }, ref) => {
    const [displayValue, setDisplayValue] = useState<string>(() => {
      const stringValue = String(value || "");
      if (stringValue && stringValue !== '0' && stringValue !== '') {
        return formatCurrency(stringValue, currencyMode);
      }
      return '';
    });
    const [isFocused, setIsFocused] = useState(false);
    const prevValueRef = useRef<string>();

    // Update display value when prop value changes (only if not focused and value actually changed)
    useEffect(() => {
      const stringValue = String(value || "");
      
      if (!isFocused && stringValue !== prevValueRef.current) {
        prevValueRef.current = stringValue;
        
        if (stringValue && stringValue !== '0' && stringValue !== '') {
          setDisplayValue(formatCurrency(stringValue, currencyMode));
        } else {
          setDisplayValue('');
        }
      }
    }, [value, isFocused, currencyMode]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = e.target.value;
      
      // Allow raw input while typing
      setDisplayValue(inputValue);
      
      // Call onChange with the raw input value
      onChange?.(inputValue);
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      // Show raw number for editing (remove formatting)
      const digits = displayValue.replace(/\D/g, '');
      if (digits) {
        setDisplayValue(digits);
      }
      props.onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      
      // Format the value when losing focus
      const digits = displayValue.replace(/\D/g, '');
      if (digits) {
        const formatted = formatCurrency(digits, currencyMode);
        setDisplayValue(formatted);
        onChange?.(digits);
      } else {
        setDisplayValue('');
        onChange?.('');
      }
      
      onBlur?.(e);
    };

    const suffix = showSuffix ? getSuffix(currencyMode, fieldType) : '';
    const defaultPlaceholder = placeholder || getPlaceholder(fieldType);

    return (
      <div className="relative">
        <Input
          {...props}
          ref={ref}
          type="text"
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          className={cn("placeholder:text-muted-foreground/40", showSuffix && "pr-10", className)}
          placeholder={defaultPlaceholder}
        />
        {showSuffix && suffix && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
            {suffix}
          </div>
        )}
      </div>
    );
  }
);

EnhancedCurrencyInput.displayName = "EnhancedCurrencyInput";