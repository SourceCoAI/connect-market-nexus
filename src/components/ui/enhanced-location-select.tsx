import { useState } from 'react';
import { STANDARDIZED_LOCATIONS } from '@/lib/financial-parser';
import { Button } from '@/components/ui/button';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { 
  USFlagIcon,
  CanadaIcon,
  GlobalIcon,
  MapPinIcon
} from '@/components/icons/LocationIcons';

interface EnhancedMultiLocationSelectProps {
  value?: string[];
  onValueChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
}

// Helper function to get location icon
const getLocationIcon = (location: string) => {
  const loc = location.toLowerCase();
  const iconClass = "w-3.5 h-3.5 text-slate-500";
  
  // US and US regions get US flag
  if (loc.includes('us') || loc === 'united states' || 
      loc.includes('northeast') || loc.includes('southeast') || 
      loc.includes('midwest') || loc.includes('southwest') || 
      loc.includes('western') || loc.includes('pacific')) {
    return <USFlagIcon className={iconClass} />;
  }
  
  // Canada
  if (loc.includes('canada')) {
    return <CanadaIcon className={iconClass} />;
  }
  
  // Global/International regions
  if (loc.includes('global') || loc.includes('international') || 
      loc.includes('north america') || loc.includes('europe') || 
      loc.includes('asia') || loc.includes('pacific')) {
    return <GlobalIcon className={iconClass} />;
  }
  
  return <MapPinIcon className={iconClass} />;
};

export function EnhancedMultiLocationSelect({ 
  value = [], 
  onValueChange, 
  placeholder = "Select locations...",
  className 
}: EnhancedMultiLocationSelectProps) {
  const [open, setOpen] = useState(false);

  // Ensure value is always an array
  const normalizedValue = Array.isArray(value) ? value : (value ? [value] : []);

  const handleSelect = (location: string) => {
    // For single selection mode
    if (normalizedValue.includes(location)) {
      onValueChange(normalizedValue.filter((v) => v !== location));
    } else {
      // Replace existing selection with new one (single select behavior)
      onValueChange([location]);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between h-11", className)}
        >
          <div className="flex items-center min-w-0">
            {normalizedValue.length > 0 ? (
              <span className="text-sm truncate">
                {normalizedValue.join(', ')}
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="z-[200] w-full min-w-[var(--radix-popover-trigger-width)] p-0 bg-background border shadow-md" align="start">
        <Command>
          <CommandInput placeholder="Search..." />
          <CommandList>
            <CommandEmpty>No options found.</CommandEmpty>
            <CommandGroup>
              {STANDARDIZED_LOCATIONS.map((location) => (
                <CommandItem
                  key={location}
                  onSelect={() => handleSelect(location)}
                  className="cursor-pointer"
                >
                  <div className="flex items-center gap-2 w-full">
                    <Check
                      className={cn(
                        "h-4 w-4 shrink-0",
                        normalizedValue.includes(location) ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                      {getLocationIcon(location)}
                      <span className="text-[10px] font-medium text-slate-700 tracking-[0.02em]">
                        {location}
                      </span>
                    </div>
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