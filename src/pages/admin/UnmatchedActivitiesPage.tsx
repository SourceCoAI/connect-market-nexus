import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Phone, AlertTriangle, Link as LinkIcon, CheckCircle } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface UnmatchedActivity {
  id: string;
  activity_type: string;
  contact_email: string | null;
  user_name: string | null;
  call_duration_seconds: number | null;
  disposition_label: string | null;
  created_at: string;
  matching_status: string;
}

export default function UnmatchedActivitiesPage() {
  const queryClient = useQueryClient();
  const [selectedDealId, setSelectedDealId] = useState<Record<string, string>>({});

  // Fetch unmatched activities
  const { data: activities = [], isLoading } = useQuery({
    queryKey: ['unmatched-activities'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('contact_activities')
        .select('id, activity_type, contact_email, user_name, call_duration_seconds, disposition_label, created_at, matching_status')
        .eq('matching_status', 'unmatched')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as UnmatchedActivity[];
    },
    staleTime: 30_000,
  });

  // Fetch active deals for linking dropdown
  const { data: activeDeals = [] } = useQuery({
    queryKey: ['active-deals-for-linking'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('deal_pipeline')
        .select('id, listing_id, title')
        .is('deleted_at', null)
        .order('title', { ascending: true })
        .limit(500);
      if (error) return [];
      return data || [];
    },
  });

  // Link activity to deal mutation
  const linkMutation = useMutation({
    mutationFn: async ({ activityId, dealId, listingId }: { activityId: string; dealId: string; listingId: string }) => {
      // 1. Update the activity with listing info
      const { error: updateErr } = await (supabase as any)
        .from('contact_activities')
        .update({
          listing_id: listingId,
          matching_status: 'manually_linked',
        })
        .eq('id', activityId);

      if (updateErr) throw updateErr;

      // 2. Log deal activity
      const activity = activities.find((a) => a.id === activityId);
      if (activity) {
        try {
          await supabase.rpc('log_deal_activity', {
            p_deal_id: dealId,
            p_activity_type: activity.activity_type === 'call_completed' ? 'call_completed' : 'note_added',
            p_title: `Manually linked: ${activity.activity_type} from ${activity.contact_email || 'unknown'}`,
            p_description: activity.disposition_label || null,
            p_admin_id: null,
            p_metadata: {
              contact_activity_id: activityId,
              contact_email: activity.contact_email,
              user_name: activity.user_name,
              linked_manually: true,
            },
          });
        } catch (e) {
          console.error('Failed to log deal activity:', e);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unmatched-activities'] });
      toast.success('Activity linked to deal');
    },
    onError: (err) => {
      toast.error(`Failed to link: ${(err as Error).message}`);
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-orange-500" />
            Unmatched Activities
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Activities from PhoneBurner that couldn't be automatically linked to a deal. Manually link them to recover data.
          </p>
        </div>
        <Badge variant="outline" className="text-lg px-3 py-1">
          {activities.length} unmatched
        </Badge>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : activities.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500 opacity-50" />
            <p className="text-lg font-medium">All activities matched!</p>
            <p className="text-sm text-muted-foreground">No orphaned activities to recover.</p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[calc(100vh-200px)]">
          <div className="space-y-3">
            {activities.map((activity) => (
              <Card key={activity.id} className="hover:bg-muted/30 transition-colors">
                <CardContent className="py-4">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center h-10 w-10 rounded-full bg-orange-50">
                      <Phone className="h-5 w-5 text-orange-600" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {activity.activity_type.replace(/_/g, ' ')}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">
                          {activity.matching_status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        {activity.contact_email && <span>{activity.contact_email}</span>}
                        {activity.user_name && <span>by {activity.user_name}</span>}
                        {activity.call_duration_seconds != null && (
                          <span>{Math.floor(activity.call_duration_seconds / 60)}m {activity.call_duration_seconds % 60}s</span>
                        )}
                        {activity.disposition_label && <span>{activity.disposition_label}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(activity.created_at), 'MMM d, yyyy h:mm a')}
                        {' '}({formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })})
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Select
                        value={selectedDealId[activity.id] || ''}
                        onValueChange={(val) => setSelectedDealId((prev) => ({ ...prev, [activity.id]: val }))}
                      >
                        <SelectTrigger className="w-[250px] text-xs">
                          <SelectValue placeholder="Select deal to link..." />
                        </SelectTrigger>
                        <SelectContent>
                          {activeDeals.map((deal: any) => (
                            <SelectItem key={deal.id} value={`${deal.id}::${deal.listing_id}`}>
                              {deal.title || 'Untitled'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Button
                        size="sm"
                        variant="default"
                        disabled={!selectedDealId[activity.id] || linkMutation.isPending}
                        onClick={() => {
                          const [dealId, listingId] = (selectedDealId[activity.id] || '').split('::');
                          if (dealId && listingId) {
                            linkMutation.mutate({ activityId: activity.id, dealId, listingId });
                          }
                        }}
                      >
                        <LinkIcon className="h-3.5 w-3.5 mr-1" />
                        Link
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
