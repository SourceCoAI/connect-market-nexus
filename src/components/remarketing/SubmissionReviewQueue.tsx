import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
  Globe,
  Mail,
  Phone,
  User,
  FileText,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export interface Submission {
  id: string;
  referral_partner_id: string;
  company_name: string;
  website: string | null;
  industry: string | null;
  revenue: number | null;
  ebitda: number | null;
  location: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  status: string;
  created_at: string | null;
  referral_partners?: { name: string } | null;
}

interface SubmissionReviewQueueProps {
  submissions: Submission[];
  isLoading?: boolean;
  showPartnerColumn?: boolean;
}

const formatCurrency = (value: number | null) => {
  if (value === null || value === undefined) return "-";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
};

export function SubmissionReviewQueue({
  submissions,
  isLoading,
  showPartnerColumn = true,
}: SubmissionReviewQueueProps) {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const reviewMutation = useMutation({
    mutationFn: async ({
      submissionId,
      action,
    }: {
      submissionId: string;
      action: "approve" | "reject";
    }) => {
      setProcessingId(submissionId);

      const { data, error } = await supabase.functions.invoke(
        "approve-referral-submission",
        { body: { submissionId, action } }
      );

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return { action, companyName: data?.listing?.title || "Submission" };
    },
    onSuccess: ({ action, companyName }) => {
      queryClient.invalidateQueries({ queryKey: ["referral-partners"] });
      queryClient.invalidateQueries({ queryKey: ["referral-submissions"] });
      queryClient.invalidateQueries({ queryKey: ["remarketing", "deals"] });
      queryClient.invalidateQueries({ queryKey: ["pending-submissions-count"] });

      if (action === "approve") {
        toast.success(`"${companyName}" approved and added to Active Deals`);
      } else {
        toast.success(`"${companyName}" rejected`);
      }
    },
    onError: (error) => {
      toast.error(`Review failed: ${error.message}`);
    },
    onSettled: () => {
      setProcessingId(null);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!submissions.length) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Check className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No pending submissions</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[30px]" />
            <TableHead>Company Name</TableHead>
            {showPartnerColumn && <TableHead>Partner</TableHead>}
            <TableHead>Website</TableHead>
            <TableHead>Industry</TableHead>
            <TableHead className="text-right">Revenue</TableHead>
            <TableHead className="text-right">EBITDA</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Submitted</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {submissions.map((sub) => {
            const isExpanded = expandedId === sub.id;
            const isProcessing = processingId === sub.id;

            return (
              <Collapsible key={sub.id} open={isExpanded} onOpenChange={() => setExpandedId(isExpanded ? null : sub.id)} asChild>
                <>
                  <CollapsibleTrigger asChild>
                    <TableRow className="cursor-pointer hover:bg-muted/50">
                      <TableCell>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{sub.company_name}</TableCell>
                      {showPartnerColumn && (
                        <TableCell className="text-muted-foreground">
                          {(sub.referral_partners as { name?: string } | undefined)?.name || "-"}
                        </TableCell>
                      )}
                      <TableCell>
                        {sub.website ? (
                          <a
                            href={sub.website.startsWith("http") ? sub.website : `https://${sub.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline text-sm"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {sub.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                          </a>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{sub.industry || "-"}</TableCell>
                      <TableCell className="text-right text-sm">{formatCurrency(sub.revenue)}</TableCell>
                      <TableCell className="text-right text-sm">{formatCurrency(sub.ebitda)}</TableCell>
                      <TableCell className="text-sm">{sub.location || "-"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {sub.created_at ? format(new Date(sub.created_at), "MMM d, yyyy") : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-green-700 border-green-300 hover:bg-green-50"
                            disabled={isProcessing}
                            onClick={() =>
                              reviewMutation.mutate({ submissionId: sub.id, action: "approve" })
                            }
                          >
                            {isProcessing ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Check className="h-3 w-3 mr-1" />
                            )}
                            Approve
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-red-700 border-red-300 hover:bg-red-50"
                            disabled={isProcessing}
                            onClick={() =>
                              reviewMutation.mutate({ submissionId: sub.id, action: "reject" })
                            }
                          >
                            <X className="h-3 w-3 mr-1" />
                            Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  </CollapsibleTrigger>
                  <CollapsibleContent asChild>
                    <TableRow className="bg-muted/30">
                      <TableCell colSpan={showPartnerColumn ? 10 : 9}>
                        <div className="py-3 px-4 grid grid-cols-2 gap-4 text-sm">
                          {sub.contact_name && (
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">Contact:</span> {sub.contact_name}
                            </div>
                          )}
                          {sub.contact_email && (
                            <div className="flex items-center gap-2">
                              <Mail className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">Email:</span> {sub.contact_email}
                            </div>
                          )}
                          {sub.contact_phone && (
                            <div className="flex items-center gap-2">
                              <Phone className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">Phone:</span> {sub.contact_phone}
                            </div>
                          )}
                          {sub.website && (
                            <div className="flex items-center gap-2">
                              <Globe className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">Website:</span>{" "}
                              <a
                                href={sub.website.startsWith("http") ? sub.website : `https://${sub.website}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline"
                              >
                                {sub.website}
                              </a>
                            </div>
                          )}
                          {sub.notes && (
                            <div className="col-span-2 flex items-start gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                              <div>
                                <span className="font-medium">Notes:</span>
                                <p className="text-muted-foreground mt-1">{sub.notes}</p>
                              </div>
                            </div>
                          )}
                          {!sub.contact_name && !sub.contact_email && !sub.contact_phone && !sub.notes && (
                            <div className="col-span-2 text-muted-foreground italic">
                              No additional details provided
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  </CollapsibleContent>
                </>
              </Collapsible>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
