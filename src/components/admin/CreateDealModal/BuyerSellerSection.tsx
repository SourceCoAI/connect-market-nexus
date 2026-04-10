// React is auto-imported via JSX transform
import { UseFormReturn } from 'react-hook-form';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/ui/numeric-input';
import { Textarea } from '@/components/ui/textarea';
import { Combobox } from '@/components/ui/combobox';
import { CreatePairingFormData } from './schema';

interface BuyerOption {
  value: string;
  label: string;
  searchTerms: string;
}

interface BuyerSellerSectionProps {
  form: UseFormReturn<CreatePairingFormData>;
  listings: { id: string; title: string; internal_company_name?: string }[] | undefined;
  stages: { id: string; name: string; color: string }[] | undefined;
  buyerOptions: BuyerOption[];
}

export function BuyerSellerSection({ form, listings, stages, buyerOptions }: BuyerSellerSectionProps) {
  const listingOptions = (listings || []).map((listing) => ({
    value: listing.id,
    label: listing.title + (listing.internal_company_name ? ` (${listing.internal_company_name})` : ''),
    searchTerms: [listing.title, listing.internal_company_name || ''].filter(Boolean).join(' ').toLowerCase(),
  }));

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground">Pairing Details</h3>

      <FormField
        control={form.control}
        name="title"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Pairing Title *</FormLabel>
            <FormControl>
              <Input
                placeholder="e.g., Acme Corp acquiring Widget Inc"
                autoFocus
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="buyer_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Buyer *</FormLabel>
              <FormControl>
                <Combobox
                  options={buyerOptions}
                  value={field.value}
                  onValueChange={field.onChange}
                  placeholder="Search buyers..."
                  emptyText="No buyers found"
                  searchPlaceholder="Search by company name..."
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="listing_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Seller (Listing) *</FormLabel>
              <FormControl>
                <Combobox
                  options={listingOptions}
                  value={field.value}
                  onValueChange={field.onChange}
                  placeholder="Search listings..."
                  emptyText="No listings found"
                  searchPlaceholder="Search by listing name..."
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="stage_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Pipeline Stage *</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select stage" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {stages?.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: stage.color }}
                        />
                        {stage.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="priority"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Priority</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="value"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Deal Value ($)</FormLabel>
            <FormControl>
              <NumericInput
                placeholder="0"
                value={field.value || ''}
                onChange={(value) =>
                  field.onChange(value ? parseFloat(value) : undefined)
                }
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Notes</FormLabel>
            <FormControl>
              <Textarea
                placeholder="Add notes about this pairing..."
                className="min-h-[80px]"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
