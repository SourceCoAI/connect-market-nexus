
Goal

Restore custom email sending on the current Brevo-based architecture by fixing the API key mismatch without changing code yet.

What your screenshot means

Brevo is behaving normally: after a key is created, it does not reveal the full value again. If you only see something like `**********WDeTb4`, that key cannot be recovered from the dashboard.

What to do next

1. Create a brand-new Brevo API key in the same Brevo workspace/account where:
   - your verified senders live
   - your SMTP setup for signup emails lives
   - the “Supabase - Marketplace” key is listed

2. Give it a clear name like:
   - `Supabase Marketplace Replacement`
   - or `SourceCo Custom Emails`

3. Copy the full key immediately when Brevo shows it the first time.

4. Replace the `BREVO_API_KEY` runtime secret in Supabase with that full new key.

5. Then test one custom app email again from the Admin Documents flow.

Why this is the right move

I checked the code paths and your custom email system still depends on `BREVO_API_KEY` in the shared senders:
- `_shared/email-sender.ts`
- `_shared/brevo-sender.ts`
- plus a few remaining direct Brevo callers

So one wrong secret can break the whole custom-email architecture while signup emails still work through SMTP.

Why this should resolve the current blocker

Your evidence so far strongly points to this:
- signup emails work through SMTP
- custom emails use Brevo API
- Brevo dashboard shows the known dashboard key was not recently used
- therefore the project is almost certainly authenticating with a different/orphaned API key

Since the old full key cannot be revealed, rotating to a fresh key in the correct Brevo workspace is the cleanest and fastest recovery path.

After the new key is added, the expected confirmation signal is

```text
Custom app email test
→ Brevo real-time dashboard shows activity immediately
→ message log appears in Brevo
→ recipient finally receives the email
```

If the new key still produces “accepted” in your app but nothing appears in Brevo logs, then we can conclude with high confidence that the issue is no longer “wrong key value” and the next strategic step would be a provider-path rebuild around the working SMTP route.

Implementation plan after you add the new key

Phase 1
- replace `BREVO_API_KEY` with the newly generated full key

Phase 2
- run one controlled custom email test from Admin Documents

Phase 3
- compare three signals together:
  - app-side accepted/send status
  - Brevo dashboard real-time/log activity
  - actual inbox delivery

Phase 4
- if Brevo logs appear, keep the current architecture and continue cleanup
- if Brevo logs still do not appear, stop patching and pivot to SMTP-based or fully rebuilt email transport

Most important point

Do not try to recover the masked key. It is not possible. The next correct move is to generate a new full API key in that exact Brevo account and replace the Supabase secret with it.
