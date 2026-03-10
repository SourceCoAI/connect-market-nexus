import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
  searchTerms?: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
  allowCustomValue?: boolean;
  onCustomValueCreate?: (value: string) => void;
}

export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Select option...",
  emptyText = "No options found.",
  searchPlaceholder = "Search...",
  className,
  disabled = false,
  allowCustomValue = false,
  onCustomValueCreate,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState("");

  const selectedOption = options.find((option) => option.value === value);

  // Check if current search matches any existing option
  const hasExactMatch = options.some(
    (option) => option.value.toLowerCase() === searchValue.toLowerCase()
  );

  // Word-based substring filter: every word in the search must appear in the value
  const wordFilter = React.useCallback((value: string, search: string) => {
    const normalizedValue = value.toLowerCase();
    const words = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return 1;
    return words.every((word) => normalizedValue.includes(word)) ? 1 : 0;
  }, []);
  
  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between", className)}
        >
          <div className="flex items-center min-w-0">
            {selectedOption ? (
              <span className="text-sm truncate">{selectedOption.label}</span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-full p-0 bg-background border shadow-md pointer-events-auto z-[100] max-h-[420px] overflow-auto"
        style={{ minWidth: '400px' }}
        onWheelCapture={(e) => e.stopPropagation()}
        onTouchMoveCapture={(e) => e.stopPropagation()}
        onScrollCapture={(e) => e.stopPropagation()}
      >
        <Command filter={wordFilter}>
          <CommandInput 
            placeholder={searchPlaceholder}
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandList className="max-h-[300px] overflow-y-auto overflow-x-hidden overscroll-contain">
            <CommandEmpty>
              {allowCustomValue && searchValue && !hasExactMatch ? (
                <div className="p-2">
                  <button
                    type="button"
                    className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent rounded-sm"
                    onClick={() => {
                      if (onCustomValueCreate) {
                        onCustomValueCreate(searchValue);
                      }
                      onValueChange(searchValue);
                      setSearchValue("");
                      setOpen(false);
                    }}
                  >
                    Create &quot;{searchValue}&quot;
                  </button>
                </div>
              ) : (
                emptyText
              )}
            </CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.searchTerms || option.label}
                  onSelect={() => {
                    onValueChange(option.value);
                    setSearchValue("");
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="min-w-0">
                    <span className="truncate block">{option.label}</span>
                    {option.description && (
                      <span className="truncate block text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
