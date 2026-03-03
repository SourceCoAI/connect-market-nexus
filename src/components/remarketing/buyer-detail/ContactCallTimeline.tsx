import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Phone, PhoneCall, PhoneOff, Clock, Mic } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

interface CallActivity {
  id: string;
  activity_type: string;
  call_started_at: string | null;
  call_ended_at: string | null;
  call_duration_seconds: number | null;
  call_outcome: string | null;
  disposition_code: string | null;
  disposition_label: string | null;
  disposition_notes: string | null;
  recording_url: string | null;
  source_system: string;
  user_name: string | null;
  created_at: string;
}

interface ContactCallTimelineProps {
  buyerId: string;
}

export function ContactCallTimeline({ buyerId }: ContactCallTimelineProps) {
  const { data: activities = [], isLoading } = useQuery({
    queryKey: ["contact-call-timeline", buyerId],
    queryFn: async () => {
      // Fetch activities linked to any contact belonging to this buyer
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id")
        .eq("remarketing_buyer_id", buyerId)
        .eq("archived", false);

      if (!contacts?.length) return [];

      const contactIds = contacts.map((c) => c.id);

      const { data, error } = await supabase
        .from("contact_activities")
        .select("*")
        .in("contact_id", contactIds)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []) as unknown as CallActivity[];
    },
    enabled: !!buyerId,
  });

  const getActivityIcon = (type: string, outcome: string | null) => {
    if (type === "call_completed" && outcome === "dispositioned") {
      return <PhoneCall className="h-4 w-4 text-primary" />;
    }
    if (type === "call_attempt") {
      return <Phone className="h-4 w-4 text-accent-foreground" />;
    }
    if (outcome === "no_answer" || outcome === "busy") {
      return <PhoneOff className="h-4 w-4 text-muted-foreground" />;
    }
    return <Phone className="h-4 w-4 text-muted-foreground" />;
  };

  const getOutcomeBadge = (activity: CallActivity) => {
    if (activity.disposition_code) {
      const variant = activity.disposition_code.includes("INTERESTED")
        ? "default"
        : activity.disposition_code.includes("NOT")
          ? "destructive"
          : "secondary";
      return (
        <Badge variant={variant as "default" | "secondary" | "destructive"} className="text-xs">
          {activity.disposition_label || activity.disposition_code}
        </Badge>
      );
    }
    if (activity.call_outcome) {
      return (
        <Badge variant="outline" className="text-xs">
          {activity.call_outcome}
        </Badge>
      );
    }
    return null;
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return null;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Call Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Phone className="h-4 w-4" />
          PhoneBurner Call Activity
        </CardTitle>
        <CardDescription>
          {activities.length === 0
            ? "No call activity recorded yet"
            : `${activities.length} activities recorded`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Phone className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No calls recorded for this buyer&apos;s contacts</p>
            <p className="text-xs mt-1">Push contacts to PhoneBurner and start dialing to see activity here</p>
          </div>
        ) : (
          <div className="space-y-1">
            {activities.map((activity) => (
              <div
                key={activity.id}
                className="flex items-start gap-3 py-2.5 px-2 rounded-md hover:bg-muted/50 transition-colors"
              >
                <div className="mt-0.5">
                  {getActivityIcon(activity.activity_type, activity.call_outcome)}
                </div>
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium capitalize">
                      {activity.activity_type.replace(/_/g, " ")}
                    </span>
                    {getOutcomeBadge(activity)}
                    {activity.call_duration_seconds ? (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDuration(activity.call_duration_seconds)}
                      </span>
                    ) : null}
                    {activity.recording_url ? (
                      <a
                        href={activity.recording_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        <Mic className="h-3 w-3" />
                        Recording
                      </a>
                    ) : null}
                  </div>
                  {activity.disposition_notes && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {activity.disposition_notes}
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {activity.user_name && <span>{activity.user_name}</span>}
                    <span>
                      {activity.call_started_at
                        ? format(new Date(activity.call_started_at), "MMM d, yyyy h:mm a")
                        : formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
