/**
 * Hook that previously sent emails for pending notifications from the client.
 *
 * DEPRECATED: This client-side email sending caused duplicate emails because
 * every admin tab with the pipeline open would independently poll and send.
 * Email notifications are now sent exclusively by the direct edge-function
 * call in useDealMutations.ts (notify-deal-owner-change).
 *
 * The hook is kept as a no-op to avoid breaking PipelineShell imports.
 */
export function useNotificationEmailSender() {
  // No-op. Email sending is handled server-side via useDealMutations.ts.
}
