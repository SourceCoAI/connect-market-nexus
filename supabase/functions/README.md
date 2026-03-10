# Supabase Edge Functions Index

> **Last updated:** 2026-02-26 (CTO Audit)
> **Total functions:** 153 (including _shared module)
> **Runtime:** Deno (TypeScript)

---

## Shared Module
| Function | Purpose |
|----------|---------|
| `_shared/` | Shared utilities: Supabase client, CORS headers, AI providers, common helpers |

## AI & Chat
| Function | Purpose |
|----------|---------|
| `ai-command-center/` | AI Command Center — unified AI assistant with 40+ tools, Claude API integration |

## Deal Management
| Function | Purpose |
|----------|---------|
| `bulk-import-remarketing/` | Bulk import deals into remarketing pipeline |
| `calculate-deal-quality/` | Deal quality scoring |
| `calculate-valuation-lead-score/` | Valuation lead scoring |
| `cleanup-captarget-deals/` | Clean up CapTarget-sourced deals |
| `convert-to-pipeline-deal/` | Convert lead to pipeline deal |
| `publish-listing/` | Publish deal listing to marketplace |
| `recalculate-deal-weights/` | Recalculate deal scoring weights |
| `score-buyer-deal/` | Score buyer-deal match |
| `score-industry-alignment/` | Score industry alignment between buyer and deal |

## Buyer Operations
| Function | Purpose |
|----------|---------|
| `approve-marketplace-buyer/` | Approve buyer for marketplace access |
| `calculate-buyer-quality-score/` | Calculate buyer quality score |
| `dedupe-buyers/` | Deduplicate buyer records |
| `extract-buyer-criteria/` | Extract buyer acquisition criteria |
| `extract-buyer-criteria-background/` | Background extraction of buyer criteria |
| `extract-buyer-transcript/` | Extract data from buyer transcripts |
| `find-buyer-contacts/` | Find contacts for a buyer |
| `generate-buyer-intro/` | Generate buyer introduction emails |
| `suggest-universe/` | AI-suggested buyer universe |

## Contact & Enrichment
| Function | Purpose |
|----------|---------|
| `discover-companies/` | Discover companies via external APIs |
| `enrich-buyer/` | Enrich buyer data |
| `enrich-deal/` | Enrich deal data |
| `enrich-external-only/` | External-only enrichment |
| `enrich-geo-data/` | Geographic data enrichment |
| `enrich-list-contacts/` | Enrich contact lists |
| `enrich-session-metadata/` | Enrich session metadata |
| `find-contacts/` | Find contacts via Prospeo/Apify |
| `process-buyer-enrichment-queue/` | Process buyer enrichment queue |
| `process-enrichment-queue/` | Process general enrichment queue |
| `test-contact-enrichment/` | Test contact enrichment pipeline |

## Apify & Scraping
| Function | Purpose |
|----------|---------|
| `apify-google-reviews/` | Scrape Google reviews via Apify |
| `apify-linkedin-scrape/` | Scrape LinkedIn profiles via Apify |
| `firecrawl-scrape/` | Web scraping via Firecrawl |

## Document & Data Room
| Function | Purpose |
|----------|---------|
| `data-room-access/` | Manage data room access |
| `data-room-download/` | Handle data room downloads |
| `data-room-upload/` | Handle data room uploads |
| `extract-deal-document/` | Extract data from deal documents |
| `get-document-download/` | Get document download URL |
| `grant-data-room-access/` | Grant data room access |
| `record-data-room-view/` | Record data room views |

## Agreements & Signatures (PandaDoc)
| Function | Purpose |
|----------|---------|
| `confirm-agreement-signed/` | Confirm agreement signature |
| `create-pandadoc-document/` | Create PandaDoc document |
| `pandadoc-integration-test/` | Test PandaDoc integration |
| `pandadoc-webhook-handler/` | Handle PandaDoc webhooks |
| `get-agreement-document/` | Get agreement document |
| `get-buyer-fee-embed/` | Get buyer fee agreement embed URL |
| `get-buyer-nda-embed/` | Get buyer NDA embed URL |
| `reset-agreement-data/` | Reset agreement data |
| `send-fee-agreement-email/` | Send fee agreement email |
| `send-fee-agreement-reminder/` | Send fee agreement reminder |
| `send-nda-email/` | Send NDA email |
| `send-nda-reminder/` | Send NDA reminder |

## Transcripts & Fireflies
| Function | Purpose |
|----------|---------|
| `auto-pair-all-fireflies/` | Auto-pair Fireflies transcripts |
| `bulk-sync-all-fireflies/` | Bulk sync all Fireflies transcripts |
| `extract-deal-transcript/` | Extract data from deal transcripts |
| `extract-transcript/` | General transcript extraction |
| `fetch-fireflies-content/` | Fetch transcript content from Fireflies |
| `parse-transcript-file/` | Parse uploaded transcript file |
| `search-fireflies-for-buyer/` | Search Fireflies for buyer transcripts |
| `sync-fireflies-transcripts/` | Sync transcripts from Fireflies |

## Email & Notifications
| Function | Purpose |
|----------|---------|
| `admin-digest/` | Admin digest email |
| `admin-notification/` | Admin notifications |
| `enhanced-admin-notification/` | Enhanced admin notifications |
| `enhanced-email-delivery/` | Enhanced email delivery |
| `draft-outreach-email/` | Draft outreach emails |
| `send-approval-email/` | Send approval emails |
| `send-connection-notification/` | Send connection notifications |
| `send-contact-response/` | Send contact response |
| `send-data-recovery-email/` | Send data recovery email |
| `send-deal-alert/` | Send deal alert |
| `send-deal-referral/` | Send deal referral |
| `send-feedback-email/` | Send feedback email |
| `send-feedback-notification/` | Send feedback notification |
| `send-marketplace-invitation/` | Send marketplace invitation |
| `send-memo-email/` | Send memo email |
| `send-owner-inquiry-notification/` | Send owner inquiry notification |
| `send-owner-intro-notification/` | Send owner intro notification |
| `send-password-reset-email/` | Send password reset email |
| `send-simple-verification-email/` | Send simple verification email |
| `send-task-notification-email/` | Send task notification email |
| `send-templated-approval-email/` | Send templated approval email |
| `send-user-notification/` | Send user notification |
| `send-verification-email/` | Send verification email |
| `send-verification-success-email/` | Send verification success email |
| `notify-admin-document-question/` | Notify admin of document question |
| `notify-deal-owner-change/` | Notify deal owner change |
| `notify-deal-reassignment/` | Notify deal reassignment |
| `notify-new-deal-owner/` | Notify new deal owner |
| `notify-remarketing-match/` | Notify remarketing match |
| `user-journey-notifications/` | User journey notifications |

## PhoneBurner
| Function | Purpose |
|----------|---------|
| `phoneburner-oauth-callback/` | PhoneBurner OAuth callback |
| `phoneburner-push-contacts/` | Push contacts to PhoneBurner |
| `phoneburner-webhook/` | Handle PhoneBurner webhooks |

## Smartlead
| Function | Purpose |
|----------|---------|
| `smartlead-campaigns/` | Smartlead campaign management |
| `smartlead-leads/` | Smartlead lead management |
| `smartlead-webhook/` | Handle Smartlead webhooks |

## HeyReach
| Function | Purpose |
|----------|---------|
| `heyreach-campaigns/` | HeyReach campaign management |
| `heyreach-leads/` | HeyReach lead management |
| `heyreach-webhook/` | Handle HeyReach webhooks |

## CapTarget
| Function | Purpose |
|----------|---------|
| `sync-captarget-sheet/` | Sync CapTarget Google Sheets |

## AI Analysis & Research
| Function | Purpose |
|----------|---------|
| `analyze-deal-notes/` | Analyse deal notes |
| `analyze-scoring-patterns/` | Analyse scoring patterns |
| `analyze-tracker-notes/` | Analyse tracker notes |
| `generate-lead-memo/` | Generate lead memo |
| `generate-ma-guide/` | Generate M&A guide |
| `generate-ma-guide-background/` | Background M&A guide generation |
| `parse-fit-criteria/` | Parse fit criteria |
| `parse-tracker-documents/` | Parse tracker documents |
| `process-ma-guide-queue/` | Process M&A guide queue |
| `validate-criteria/` | Validate buyer criteria |

## Auth & Security
| Function | Purpose |
|----------|---------|
| `admin-reset-password/` | Admin password reset |
| `create-lead-user/` | Create lead user account |
| `invite-team-member/` | Invite team member |
| `otp-rate-limiter/` | OTP rate limiting |
| `password-reset/` | Password reset |
| `password-security/` | Password security validation |
| `rate-limiter/` | General rate limiting |
| `security-validation/` | Security validation |
| `session-heartbeat/` | Session heartbeat |
| `session-security/` | Session security |
| `validate-referral-access/` | Validate referral access |

## Analytics & Tracking
| Function | Purpose |
|----------|---------|
| `aggregate-daily-metrics/` | Aggregate daily metrics |
| `enrich-session-metadata/` | Enrich session metadata |
| `generate-tracked-link/` | Generate tracked links |
| `get-feedback-analytics/` | Get feedback analytics |
| `log-pdf-download/` | Log PDF downloads |
| `record-link-open/` | Record link opens |
| `track-engagement-signal/` | Track engagement signals |
| `track-initial-session/` | Track initial session |
| `track-session/` | Track session |

## Miscellaneous
| Function | Purpose |
|----------|---------|
| `approve-referral-submission/` | Approve referral submission |
| `auto-create-firm-on-approval/` | Auto-create firm on approval |
| `auto-create-firm-on-signup/` | Auto-create firm on signup |
| `clarify-industry/` | Clarify industry classification |
| `error-logger/` | Error logging |
| `extract-standup-tasks/` | Extract standup tasks |
| `get-mapbox-token/` | Get Mapbox token |
| `import-reference-data/` | Import reference data |
| `map-csv-columns/` | Map CSV columns |
| `process-scoring-queue/` | Process scoring queue |
| `process-standup-webhook/` | Process standup webhook |
| `submit-referral-deal/` | Submit referral deal |
| `sync-missing-profiles/` | Sync missing profiles |
| `verify-platform-website/` | Verify platform website |
