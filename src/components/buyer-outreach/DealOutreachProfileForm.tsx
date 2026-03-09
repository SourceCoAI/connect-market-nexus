import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { FileText, Pencil, Save, X } from 'lucide-react';

interface DealOutreachProfileFormProps {
  dealId: string;
}

interface OutreachProfile {
  id: string;
  deal_id: string;
  deal_descriptor: string;
  geography: string;
  ebitda: string;
  created_at: string;
  updated_at: string;
}

export function DealOutreachProfileForm({ dealId }: DealOutreachProfileFormProps) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [dealDescriptor, setDealDescriptor] = useState('');
  const [geography, setGeography] = useState('');
  const [ebitda, setEbitda] = useState('');

  const { data: profile, isLoading } = useQuery({
    queryKey: ['deal-outreach-profile', dealId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_outreach_profiles' as any)
        .select('*')
        .eq('deal_id', dealId)
        .maybeSingle();

      if (error) throw error;
      return data as OutreachProfile | null;
    },
    enabled: !!dealId,
  });

  useEffect(() => {
    if (profile) {
      setDealDescriptor(profile.deal_descriptor);
      setGeography(profile.geography);
      setEbitda(profile.ebitda);
    }
  }, [profile]);

  const upsertMutation = useMutation({
    mutationFn: async (values: { deal_descriptor: string; geography: string; ebitda: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (profile) {
        const { error } = await supabase
          .from('deal_outreach_profiles' as any)
          .update({
            deal_descriptor: values.deal_descriptor,
            geography: values.geography,
            ebitda: values.ebitda,
            updated_at: new Date().toISOString(),
          } as any)
          .eq('id', profile.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('deal_outreach_profiles' as any)
          .insert({
            deal_id: dealId,
            deal_descriptor: values.deal_descriptor,
            geography: values.geography,
            ebitda: values.ebitda,
            created_by: user.id,
          } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal-outreach-profile', dealId] });
      setIsEditing(false);
      toast({
        title: 'Outreach profile saved',
        description: 'Deal outreach variables have been updated.',
      });
    },
    onError: (err) => {
      toast({
        title: 'Error saving profile',
        description: err instanceof Error ? err.message : 'Something went wrong',
        variant: 'destructive',
      });
    },
  });

  const handleSave = () => {
    if (!dealDescriptor.trim() || !geography.trim() || !ebitda.trim()) {
      toast({
        title: 'All fields required',
        description: 'Please fill in all outreach profile fields.',
        variant: 'destructive',
      });
      return;
    }
    upsertMutation.mutate({
      deal_descriptor: dealDescriptor.trim(),
      geography: geography.trim(),
      ebitda: ebitda.trim(),
    });
  };

  const handleCancel = () => {
    if (profile) {
      setDealDescriptor(profile.deal_descriptor);
      setGeography(profile.geography);
      setEbitda(profile.ebitda);
    } else {
      setDealDescriptor('');
      setGeography('');
      setEbitda('');
    }
    setIsEditing(false);
  };

  if (isLoading) {
    return null;
  }

  // No profile exists — show setup prompt
  if (!profile && !isEditing) {
    return (
      <Card className="border-dashed border-2 border-blue-200 bg-blue-50/50">
        <CardContent className="py-6 text-center">
          <FileText className="h-8 w-8 mx-auto text-blue-400 mb-3" />
          <h3 className="font-semibold text-sm mb-1">Set up outreach profile before contacting buyers</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Define the deal variables used in email, LinkedIn, and call outreach sequences.
          </p>
          <Button size="sm" onClick={() => setIsEditing(true)}>
            Set Up Outreach Profile
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Profile exists and not editing — show read-only card
  if (profile && !isEditing) {
    return (
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Outreach Profile
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)} className="h-7 gap-1">
              <Pencil className="h-3 w-3" />
              Edit
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">Deal Descriptor</span>
              <p className="font-medium">{profile.deal_descriptor}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Geography</span>
              <p className="font-medium">{profile.geography}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">EBITDA</span>
              <p className="font-medium">
                {profile.ebitda
                  ? `$${Number(profile.ebitda.replace(/,/g, '')).toLocaleString('en-US')}`
                  : '—'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Editing mode
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <FileText className="h-4 w-4" />
          {profile ? 'Edit Outreach Profile' : 'Set Up Outreach Profile'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="deal_descriptor">Deal Descriptor</Label>
          <Input
            id="deal_descriptor"
            value={dealDescriptor}
            onChange={(e) => setDealDescriptor(e.target.value)}
            placeholder="e.g. 3-location collision repair business"
          />
          <p className="text-xs text-muted-foreground">
            e.g. 3-location collision repair business, commercial HVAC services company
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="geography">Geography</Label>
          <Input
            id="geography"
            value={geography}
            onChange={(e) => setGeography(e.target.value)}
            placeholder="e.g. in Texas"
          />
          <p className="text-xs text-muted-foreground">
            e.g. in Texas, across TX and OK, in the Dallas-Fort Worth metro, operating nationally
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ebitda">EBITDA</Label>
          <NumericInput
            id="ebitda"
            value={ebitda}
            onChange={(value: string) => setEbitda(value)}
            placeholder="e.g. 1,000,000"
          />
          <p className="text-xs text-muted-foreground">
            e.g. 1,000,000, 1,200,000, 600,000
          </p>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button size="sm" onClick={handleSave} disabled={upsertMutation.isPending} className="gap-1">
            <Save className="h-3 w-3" />
            {upsertMutation.isPending ? 'Saving...' : 'Save Profile'}
          </Button>
          <Button size="sm" variant="ghost" onClick={handleCancel} className="gap-1">
            <X className="h-3 w-3" />
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
