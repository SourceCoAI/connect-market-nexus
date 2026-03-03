import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DialerEntityType } from "@/hooks/use-push-to-dialer";
import {
  usePhoneBurnerConnectedUsers,
  type PhoneBurnerConnectedUser,
} from "@/hooks/use-phoneburner-users";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Phone,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Users,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

interface PushToDialerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactIds: string[];
  contactCount: number;
  entityType?: DialerEntityType;
}

interface PushResult {
  success: boolean;
  contacts_added: number;
  contacts_failed: number;
  contacts_excluded: number;
  exclusions?: { name: string; reason: string }[];
  errors?: string[];
  error?: string;
  redirect_url?: string;
}

export function PushToDialerModal({
  open,
  onOpenChange,
  contactIds,
  contactCount,
  entityType = "contacts",
}: PushToDialerModalProps) {
  const [sessionName, setSessionName] = useState(
    `Buyer Outreach - ${new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" })}`,
  );
  const [skipRecentDays] = useState(7);
  const [skipRecent, setSkipRecent] = useState(true);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [result, setResult] = useState<PushResult | null>(null);
  const [multiResults, setMultiResults] = useState<
    Array<{ user: PhoneBurnerConnectedUser; result: PushResult }>
  >([]);

  const { data: connectedUsers = [], isLoading: usersLoading } =
    usePhoneBurnerConnectedUsers();

  const validUsers = connectedUsers.filter((u) => !u.is_expired);

  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  };

  const selectAllUsers = () => {
    if (selectedUserIds.length === validUsers.length) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(validUsers.map((u) => u.user_id));
    }
  };

  const pushMutation = useMutation({
    mutationFn: async () => {
      const targetUsers =
        selectedUserIds.length > 0
          ? selectedUserIds
          : [undefined]; // Push to calling user's own account if none selected

      const results: Array<{
        user: PhoneBurnerConnectedUser | null;
        result: PushResult;
      }> = [];

      for (const targetUserId of targetUsers) {
        const { data, error } = await supabase.functions.invoke(
          "phoneburner-push-contacts",
          {
            body: {
              entity_type: entityType,
              entity_ids: contactIds,
              session_name: sessionName,
              skip_recent_days: skipRecent ? skipRecentDays : 0,
              ...(targetUserId ? { target_user_id: targetUserId } : {}),
            },
          },
        );

        if (error) {
          results.push({
            user: connectedUsers.find((u) => u.user_id === targetUserId) || null,
            result: {
              success: false,
              contacts_added: 0,
              contacts_failed: 0,
              contacts_excluded: 0,
              error: error instanceof Error ? error.message : String(error),
            },
          });
        } else {
          results.push({
            user: connectedUsers.find((u) => u.user_id === targetUserId) || null,
            result: data as PushResult,
          });
        }
      }

      return results;
    },
    onSuccess: (results) => {
      if (results.length === 1) {
        // Single user push — show simple result
        setResult(results[0].result);
        if (results[0].result.success && results[0].result.contacts_added > 0) {
          toast.success(
            `${results[0].result.contacts_added} contacts pushed to PhoneBurner`,
          );
          // Open PhoneBurner dialer in new tab if redirect URL returned
          if (results[0].result.redirect_url) {
            window.open(results[0].result.redirect_url, '_blank');
          }
        } else if (results[0].result.error) {
          toast.error(results[0].result.error);
        }
      } else {
        // Multi-user push — show combined results
        const totalAdded = results.reduce(
          (sum, r) => sum + (r.result.contacts_added || 0),
          0,
        );
        const totalFailed = results.reduce(
          (sum, r) => sum + (r.result.contacts_failed || 0),
          0,
        );
        setMultiResults(
          results.filter(
            (r): r is { user: PhoneBurnerConnectedUser; result: PushResult } =>
              r.user !== null,
          ),
        );

        if (totalAdded > 0) {
          toast.success(
            `${totalAdded} contacts pushed across ${results.length} PhoneBurner accounts`,
          );
          // Open first redirect URL for multi-user push
          const firstRedirect = results.find((r) => r.result.redirect_url)?.result.redirect_url;
          if (firstRedirect) {
            window.open(firstRedirect, '_blank');
          }
        }
        if (totalFailed > 0) {
          toast.warning(`${totalFailed} contacts failed across accounts`);
        }
      }
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("PB_NOT_CONNECTED")) {
        toast.error(
          "PhoneBurner not connected. Connect accounts in PhoneBurner Settings first.",
        );
      } else {
        toast.error(`Push failed: ${msg}`);
      }
    },
  });

  const handleClose = () => {
    setResult(null);
    setMultiResults([]);
    setSelectedUserIds([]);
    onOpenChange(false);
  };

  const hasResults = result !== null || multiResults.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Push to PhoneBurner
          </DialogTitle>
          <DialogDescription>
            Push {contactCount} selected contact{contactCount !== 1 ? "s" : ""}{" "}
            to PhoneBurner dial sessions
          </DialogDescription>
        </DialogHeader>

        {!hasResults ? (
          <>
            <div className="space-y-4 py-2">
              {/* Summary */}
              <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50">
                <Badge variant="secondary" className="text-sm">
                  {contactCount} contacts
                </Badge>
                <span className="text-sm text-muted-foreground">
                  ~{Math.round(contactCount * 2.5)} min estimated dial time
                </span>
              </div>

              {/* Target User Picker */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Users className="h-4 w-4" />
                  Push to PhoneBurner Account(s)
                </Label>
                {usersLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground p-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading connected accounts...
                  </div>
                ) : validUsers.length === 0 ? (
                  <div className="flex items-center gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 text-sm">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span className="text-amber-800 dark:text-amber-200">
                      No PhoneBurner accounts connected. Go to{" "}
                      <a
                        href="/admin/phoneburner/settings"
                        className="underline font-medium"
                      >
                        PhoneBurner Settings
                      </a>{" "}
                      to connect accounts.
                    </span>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {validUsers.length > 1 && (
                      <div className="flex items-center gap-2 mb-1">
                        <Checkbox
                          id="select-all-users"
                          checked={selectedUserIds.length === validUsers.length}
                          onCheckedChange={selectAllUsers}
                        />
                        <Label
                          htmlFor="select-all-users"
                          className="text-xs text-muted-foreground cursor-pointer"
                        >
                          Select all ({validUsers.length} accounts)
                        </Label>
                      </div>
                    )}
                    <div className="max-h-40 overflow-y-auto space-y-1 border rounded-md p-2">
                      {validUsers.map((user) => (
                        <div
                          key={user.user_id}
                          className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/50"
                        >
                          <Checkbox
                            id={`pb-user-${user.user_id}`}
                            checked={selectedUserIds.includes(user.user_id)}
                            onCheckedChange={() => toggleUser(user.user_id)}
                          />
                          <Label
                            htmlFor={`pb-user-${user.user_id}`}
                            className="flex-1 cursor-pointer"
                          >
                            <span className="text-sm font-medium">
                              {user.label}
                            </span>
                            {user.phoneburner_user_email && (
                              <span className="text-xs text-muted-foreground ml-1.5">
                                ({user.phoneburner_user_email})
                              </span>
                            )}
                          </Label>
                        </div>
                      ))}
                    </div>
                    {selectedUserIds.length === 0 && validUsers.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Select which PhoneBurner account(s) to push contacts to.
                        Select multiple to push the same contacts to several
                        reps.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Session Name */}
              <div className="space-y-2">
                <Label htmlFor="session-name">Session Name</Label>
                <Input
                  id="session-name"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  placeholder="e.g., PE Buyers - Feb 2026"
                />
              </div>

              {/* Skip Recent */}
              <div className="flex items-start gap-3">
                <Checkbox
                  id="skip-recent"
                  checked={skipRecent}
                  onCheckedChange={(v) => setSkipRecent(v === true)}
                />
                <div className="space-y-1">
                  <Label htmlFor="skip-recent" className="cursor-pointer">
                    Skip recently contacted
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Exclude contacts called within the last {skipRecentDays} days
                  </p>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={() => pushMutation.mutate()}
                disabled={
                  pushMutation.isPending ||
                  !sessionName.trim() ||
                  (validUsers.length > 0 && selectedUserIds.length === 0)
                }
              >
                {pushMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Pushing
                    {selectedUserIds.length > 1
                      ? ` to ${selectedUserIds.length} accounts...`
                      : "..."}
                  </>
                ) : (
                  <>
                    <Phone className="mr-2 h-4 w-4" />
                    Push to Dialer
                    {selectedUserIds.length > 1
                      ? ` (${selectedUserIds.length} accounts)`
                      : ""}
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        ) : multiResults.length > 0 ? (
          <>
            {/* Multi-user results */}
            <div className="space-y-3 py-2">
              <p className="text-sm font-medium">Push Results</p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {multiResults.map(({ user, result: r }) => (
                  <div
                    key={user.user_id}
                    className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      {r.success && r.contacts_added > 0 ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                      )}
                      <span className="font-medium">{user.label}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.contacts_added > 0
                        ? `${r.contacts_added} added`
                        : r.error || "0 added"}
                      {r.contacts_excluded > 0 &&
                        `, ${r.contacts_excluded} excluded`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        ) : result ? (
          <>
            {/* Single user result */}
            <div className="space-y-3 py-2">
              {result.success && result.contacts_added > 0 ? (
                <div className="flex items-center gap-2 p-3 rounded-md bg-muted">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium">
                    {result.contacts_added} contacts pushed successfully
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  <span className="text-sm font-medium">
                    {result.error || "No contacts were pushed"}
                  </span>
                </div>
              )}

              {result.contacts_excluded > 0 && result.exclusions && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {result.contacts_excluded} excluded:
                  </p>
                  <div className="max-h-32 overflow-y-auto space-y-0.5">
                    {result.exclusions.map((e, i) => (
                      <p key={i} className="text-xs text-muted-foreground">
                        &bull; {e.name} &mdash; {e.reason}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {result.contacts_failed > 0 && result.errors && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-destructive">
                    {result.contacts_failed} failed:
                  </p>
                  <div className="max-h-32 overflow-y-auto space-y-0.5">
                    {result.errors.map((e, i) => (
                      <p key={i} className="text-xs text-destructive/80">
                        &bull; {e}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
