import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bell, Search, MapPin, DollarSign, TrendingUp } from 'lucide-react';
import { useCreateDealAlert, CreateDealAlertRequest } from '@/hooks/use-deal-alerts';
import { useListingMetadata } from '@/hooks/marketplace/use-listings';
import { AlertPreview } from './AlertPreview';
import { AlertSuccessOnboarding } from './AlertSuccessOnboarding';
import { useAuth } from '@/contexts/AuthContext';
import { MultiCategorySelect } from '@/components/ui/category-select';
import { MultiLocationSelect } from '@/components/ui/location-select';

const REVENUE_RANGES = [
  { label: 'Under $1M', min: 0, max: 1000000 },
  { label: '$1M - $5M', min: 1000000, max: 5000000 },
  { label: '$5M - $10M', min: 5000000, max: 10000000 },
  { label: '$10M - $25M', min: 10000000, max: 25000000 },
  { label: '$25M - $50M', min: 25000000, max: 50000000 },
  { label: 'Over $50M', min: 50000000, max: undefined },
];

const EBITDA_RANGES = [
  { label: 'Under $500K', min: 0, max: 500000 },
  { label: '$500K - $2M', min: 500000, max: 2000000 },
  { label: '$2M - $5M', min: 2000000, max: 5000000 },
  { label: '$5M - $10M', min: 5000000, max: 10000000 },
  { label: 'Over $10M', min: 10000000, max: undefined },
];

interface CreateDealAlertDialogProps {
  trigger?: React.ReactNode;
}

export function CreateDealAlertDialog({ trigger }: CreateDealAlertDialogProps) {
  const [open, setOpen] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [formData, setFormData] = useState<CreateDealAlertRequest>({
    name: '',
    criteria: {},
    frequency: 'instant', // Default to instant
  });

  const createAlert = useCreateDealAlert();
  useListingMetadata();
  const { user } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    try {
      await createAlert.mutateAsync(formData);
      setShowSuccess(true);
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      criteria: {},
      frequency: 'instant',
    });
    setShowSuccess(false);
  };

  const handleClose = () => {
    setOpen(false);
    setTimeout(() => {
      resetForm();
    }, 300);
  };

  const handleCreateAnother = () => {
    resetForm();
  };

  const updateCriteria = (key: string, value: string | number | string[] | undefined) => {
    setFormData((prev) => ({
      ...prev,
      criteria: {
        ...prev.criteria,
        [key]: value,
      },
    }));
  };

  const handleRevenueRangeChange = (value: string) => {
    const range = REVENUE_RANGES.find((r) => r.label === value);
    if (range) {
      updateCriteria('revenueMin', range.min);
      updateCriteria('revenueMax', range.max);
    }
  };

  const handleEbitdaRangeChange = (value: string) => {
    const range = EBITDA_RANGES.find((r) => r.label === value);
    if (range) {
      updateCriteria('ebitdaMin', range.min);
      updateCriteria('ebitdaMax', range.max);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen} modal={true}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70">
            <Bell className="h-4 w-4 mr-2" />
            Get Deal Alerts
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {showSuccess ? (
          <>
            <DialogHeader>
              <DialogTitle>Success!</DialogTitle>
            </DialogHeader>
            <AlertSuccessOnboarding onClose={handleClose} onCreateAnother={handleCreateAnother} />
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Get First Access to New Deals</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Tell us exactly what you want. We’ll notify you in-app the moment a new deal matches
                your exact criteria.
              </p>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">What deals are you looking for?</Label>
                <Input
                  id="name"
                  placeholder="e.g., SaaS companies in California under $5M revenue"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Describe it in your own words — we’ll use this label across your dashboard.
                </p>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Alert Criteria</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Search className="h-4 w-4" />
                        Search Keywords
                      </Label>
                      <Input
                        placeholder="e.g., SaaS, manufacturing — or write it verbatim: ‘Reach out when there’s a B2B SaaS in CA with $3–10M revenue’"
                        value={formData.criteria.search || ''}
                        onChange={(e) => updateCriteria('search', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        You can be specific in plain English — we’ll match exactly to what you
                        write.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Categories</Label>
                      <MultiCategorySelect
                        value={
                          formData.criteria.categories ??
                          (formData.criteria.category ? [formData.criteria.category] : [])
                        }
                        onValueChange={(values) => {
                          updateCriteria('categories', values);
                          // keep single-value fallback for compatibility
                          updateCriteria('category', values.length === 1 ? values[0] : '');
                        }}
                        placeholder="Any categories"
                        className="z-[200]"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Locations
                      </Label>
                      <MultiLocationSelect
                        value={
                          formData.criteria.locations ??
                          (formData.criteria.location ? [formData.criteria.location] : [])
                        }
                        onValueChange={(values) => {
                          updateCriteria('locations', values);
                          // keep single-value fallback for compatibility
                          updateCriteria('location', values.length === 1 ? values[0] : '');
                        }}
                        placeholder="Any locations"
                        className="z-[200]"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Frequency</Label>
                      <Select
                        value={formData.frequency}
                        onValueChange={(value: 'instant' | 'daily' | 'weekly') =>
                          setFormData((prev) => ({ ...prev, frequency: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="z-[200]">
                          <SelectItem value="instant">
                            Only when deals match my criteria (recommended)
                          </SelectItem>
                          <SelectItem value="daily">Daily digest</SelectItem>
                          <SelectItem value="weekly">Weekly digest</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        Revenue Range
                      </Label>
                      <Select onValueChange={handleRevenueRangeChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Any revenue" />
                        </SelectTrigger>
                        <SelectContent className="z-[200]">
                          <SelectItem value="all">Any revenue</SelectItem>
                          {REVENUE_RANGES.map((range) => (
                            <SelectItem key={range.label} value={range.label}>
                              {range.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        EBITDA Range
                      </Label>
                      <Select onValueChange={handleEbitdaRangeChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Any EBITDA" />
                        </SelectTrigger>
                        <SelectContent className="z-[200]">
                          <SelectItem value="all">Any EBITDA</SelectItem>
                          {EBITDA_RANGES.map((range) => (
                            <SelectItem key={range.label} value={range.label}>
                              {range.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Alert Preview */}
              {formData.name && (
                <AlertPreview
                  alertName={formData.name}
                  criteria={formData.criteria}
                  frequency={formData.frequency}
                  userEmail={user?.email}
                />
              )}

              <div className="flex gap-3 justify-end">
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!formData.name.trim() || createAlert.isPending}>
                  {createAlert.isPending ? 'Creating...' : 'Create Alert'}
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
