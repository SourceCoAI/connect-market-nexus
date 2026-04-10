#!/usr/bin/env bash
# ============================================================================
# lint-contacts-invariants.sh
# ============================================================================
# Governance guardrail for the contact consolidation strategy.
#
# Enforces three invariants on the set of files currently staged for commit:
#
#   1. No new table named *contacts*. The only contact-related tables are
#      public.contacts (canonical) and public.contact_events (history).
#      Future migrations must extend contacts, not fork a parallel table.
#
#   2. No direct .from('contacts').insert|update|upsert|delete in src/ or
#      supabase/functions/. All writes go through the contacts_upsert() RPC
#      exposed in src/lib/data-access/contacts.ts. Reads are unaffected.
#
#   3. No new CREATE OR REPLACE FUNCTION for the two frozen helpers
#      (update_updated_at_column, is_admin). See
#      DATABASE_DUPLICATES_AUDIT_2026-04-09.md §3.
#
# Bypass (use sparingly and explain why in the commit message):
#   SKIP_CONTACT_LINT=1 git commit ...
# ============================================================================

set -euo pipefail

if [ "${SKIP_CONTACT_LINT:-0}" = "1" ]; then
  echo "lint-contacts-invariants: skipped via SKIP_CONTACT_LINT=1"
  exit 0
fi

# Only lint staged files that actually exist (skip deletes)
staged_files=$(git diff --cached --name-only --diff-filter=ACMR || true)
if [ -z "$staged_files" ]; then
  exit 0
fi

fail=0

# ─── Invariant 1: No new *contacts* tables in migrations ──────────────────
migration_files=$(echo "$staged_files" | grep -E '^supabase/migrations/.*\.sql$' || true)
if [ -n "$migration_files" ]; then
  # Allow public.contacts and public.contact_events; anything else is a fork
  # Match any CREATE TABLE with a name containing "contact" — then exclude
  # only the exact canonical table names (word-boundary anchored).
  forbidden=$(echo "$migration_files" | xargs grep -nE 'CREATE TABLE (IF NOT EXISTS )?(public\.)?\w*contacts?\b' 2>/dev/null \
    | grep -vE '\b(public\.)?contacts\b\s*\(' \
    | grep -vE '\b(public\.)?contact_events\b\s*\(' \
    || true)
  if [ -n "$forbidden" ]; then
    echo "ERROR: new contact-related table detected. Extend public.contacts instead."
    echo "$forbidden"
    echo ""
    echo "If you genuinely need a new table, update the contact consolidation"
    echo "strategy doc and the lint whitelist before committing."
    fail=1
  fi
fi

# ─── Invariant 2: No direct writes to contacts in src/ or edge functions ──
code_files=$(echo "$staged_files" | grep -E '^(src/|supabase/functions/).*\.(ts|tsx|js|jsx)$' \
  | grep -v 'src/lib/data-access/contacts.ts' \
  | grep -v 'src/integrations/supabase/types.ts' \
  || true)

if [ -n "$code_files" ]; then
  direct_writes=$(echo "$code_files" | xargs grep -nE "\.from\(['\"]contacts['\"]\)\.(insert|update|upsert|delete)" 2>/dev/null || true)
  if [ -n "$direct_writes" ]; then
    echo "ERROR: direct write to contacts table detected. Use contacts_upsert() RPC."
    echo "$direct_writes"
    echo ""
    echo "Import upsertContact from src/lib/data-access/contacts.ts instead."
    fail=1
  fi
fi

# ─── Invariant 3: No redefinition of frozen utility functions ─────────────
if [ -n "$migration_files" ]; then
  frozen_redef=$(echo "$migration_files" | xargs grep -nE 'CREATE (OR REPLACE )?FUNCTION\s+(public\.)?(update_updated_at_column|is_admin)\b' 2>/dev/null || true)
  if [ -n "$frozen_redef" ]; then
    echo "ERROR: frozen utility function redefinition detected."
    echo "$frozen_redef"
    echo ""
    echo "update_updated_at_column() and is_admin(uuid) were frozen in"
    echo "20260625000000_freeze_shared_utilities.sql. If you have a strong"
    echo "reason to modify them, update DATABASE_DUPLICATES_AUDIT_2026-04-09.md §3"
    echo "and mention the override in your commit message."
    fail=1
  fi
fi

if [ "$fail" = "1" ]; then
  echo ""
  echo "Commit blocked by lint-contacts-invariants.sh"
  echo "See DATABASE_DUPLICATES_AUDIT_2026-04-09.md and the contact consolidation"
  echo "strategy for rationale. Bypass with SKIP_CONTACT_LINT=1 if absolutely needed."
  exit 1
fi

exit 0
