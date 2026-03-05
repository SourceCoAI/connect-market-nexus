import React, { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface NumericInputProps extends Omit<React.ComponentProps<"input">, "onChange" | "value" | "type"> {
  value?: string | number;
  onChange?: (value: string) => void;
  onNumericChange?: (value: number | undefined) => void;
}

function formatWithCommas(value: string): string {
  const digits = value.replace(/[^0-9]/g, '');
  if (!digits) return '';
  return parseInt(digits).toLocaleString('en-US');
}

function stripCommas(value: string): string {
  return value.replace(/,/g, '');
}

export const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  ({ className, value, onChange, onNumericChange, onFocus, onBlur, ...props }, ref) => {
    const [displayValue, setDisplayValue] = useState<string>(() => {
      const str = String(value ?? '');
      const stripped = stripCommas(str);
      if (stripped && !isNaN(Number(stripped))) {
        return formatWithCommas(stripped);
      }
      return '';
    });
    const [isFocused, setIsFocused] = useState(false);
    const prevValueRef = useRef<string>();

    useEffect(() => {
      const str = String(value ?? '');
      const stripped = stripCommas(str);

      if (!isFocused && stripped !== prevValueRef.current) {
        prevValueRef.current = stripped;
        if (stripped && !isNaN(Number(stripped))) {
          setDisplayValue(formatWithCommas(stripped));
        } else {
          setDisplayValue('');
        }
      }
    }, [value, isFocused]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      // Only allow digits and commas
      const cleaned = raw.replace(/[^0-9,]/g, '');
      setDisplayValue(cleaned);

      const numericStr = stripCommas(cleaned);
      onChange?.(numericStr);
      if (onNumericChange) {
        onNumericChange(numericStr ? parseInt(numericStr) : undefined);
      }
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      // Keep formatted display while editing for readability
      onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      const numericStr = stripCommas(displayValue);
      if (numericStr && !isNaN(Number(numericStr))) {
        setDisplayValue(formatWithCommas(numericStr));
      } else {
        setDisplayValue('');
      }
      onBlur?.(e);
    };

    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={cn(className)}
      />
    );
  }
);

NumericInput.displayName = "NumericInput";
