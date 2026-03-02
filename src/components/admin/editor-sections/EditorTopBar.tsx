import { FormField, FormItem, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { UseFormReturn } from "react-hook-form";
import { EnhancedMultiCategorySelect } from "@/components/ui/enhanced-category-select";
import { EnhancedMultiLocationSelect } from "@/components/ui/enhanced-location-select";
import { cn } from "@/lib/utils";

interface EditorTopBarProps {
  form: UseFormReturn<any>;
}

export function EditorTopBar({ form }: EditorTopBarProps) {
  const acquisitionType = form.watch('acquisition_type');
  const status = form.watch('status');

  return (
    <div className="bg-white border-b border-border shadow-sm -mx-10 px-10 py-6 mb-6">
      <div className="max-w-[1600px] mx-auto">
        {/* Title - full width */}
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input
                  placeholder="Business Title"
                  className="h-11 text-lg font-semibold mb-4 border-0 border-b border-border/60 rounded-none px-0 focus:border-primary transition-colors text-foreground"
                  {...field}
                  value={field.value || ''}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        {/* Meta row */}
        <div className="flex items-center gap-6">
          {/* Industries */}
          <div className="flex-1 min-w-0">
            <FormField
              control={form.control}
              name="categories"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <EnhancedMultiCategorySelect
                      value={field.value || []}
                      onValueChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          
          {/* Location */}
          <div className="w-[200px]">
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <EnhancedMultiLocationSelect
                      value={Array.isArray(field.value) ? field.value : (field.value ? [field.value] : [])}
                      onValueChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          
          {/* Type segmented control */}
          <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => form.setValue('acquisition_type', 'platform')}
              className={cn(
                "px-3 py-1.5 rounded text-sm font-medium transition-all",
                acquisitionType === 'platform'
                  ? "bg-white text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Platform
            </button>
            <button
              type="button"
              onClick={() => form.setValue('acquisition_type', 'add_on')}
              className={cn(
                "px-3 py-1.5 rounded text-sm font-medium transition-all",
                acquisitionType === 'add_on'
                  ? "bg-white text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Add-on
            </button>
          </div>
          
          {/* Status indicator */}
          <div className="flex items-center gap-2">
            <div className={cn(
              "h-2 w-2 rounded-full",
              status === 'active' ? "bg-green-500" : "bg-muted-foreground/40"
            )} />
            <span className="text-sm text-muted-foreground">
              {status === 'active' ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
