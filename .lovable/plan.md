
Fix analyst notes leak + broken preview

What I found
- In `supabase/functions/generate-lead-memo/index.ts`, the prompt still contradicts the goal. It says to keep conflict notes out of the memo, but it also says “If figures don't reconcile... include both and flag it,” which invites discrepancy language into the investor-facing memo.
- The memo is still framed as an internal analyst memo, not a clean investor-shareable document, so the model is being pushed in the wrong direction.
- Parsing is brittle: only the exact `---ANALYST-NOTES---` delimiter is extracted. If Claude outputs a variant like `## Analyst Notes`, those notes stay in the memo body.
- The code can still save a “best attempt” after failed validation, so analyst-style content can slip through.
- In `MemosTab.tsx`, the notes are rendered inside the same memo flow at the bottom of the scroll area, so they feel like part of the memo. The current collapsible UX is weak, and the chevron/open-state behavior is not implemented correctly.

Implementation
1. Harden the generation contract in `supabase/functions/generate-lead-memo/index.ts`
   - Rewrite the full memo prompt so it is explicitly investor-shareable.
   - Remove every instruction that tells the model to “flag” or explain conflicts inside the memo.
   - Require two explicit output blocks, e.g. `<memo>...</memo>` and `<analyst_notes>...</analyst_notes>`, instead of relying on one delimiter only.

2. Make extraction robust
   - Add a helper that extracts analyst notes from:
     - the new tagged blocks,
     - the current `---ANALYST-NOTES---` delimiter,
     - fallback headings like `## ANALYST NOTES`.
   - If an analyst-notes block or heading appears in parsed sections, move it out before saving.

3. Add investor-safety validation
   - Reject and retry outputs when the memo body contains analyst-language patterns such as source comparisons, “Call 1,” “transcript,” “enrichment,” “manual entry,” “conflict,” “discrepancy,” “verified,” “unverified,” or “reconcile.”
   - Reject any leftover analyst-notes headers inside memo sections.
   - If retries still fail, return an error instead of saving an investor-unsafe memo.

4. Fix the preview layout in `src/components/admin/data-room/MemosTab.tsx`
   - Stop rendering analyst notes inside the memo document.
   - Keep the memo preview as one clean document block.
   - Render a separate admin-only panel below it: “Internal Analyst Notes — Not included in PDF/DOCX.”
   - Remove the collapsible for this panel so it is always visible, clearly separate, and impossible to confuse with investor copy.

5. QA
   - Regenerate a memo using a deal with conflicting figures.
   - Confirm the memo body uses only the chosen final figures with no discrepancy language.
   - Confirm analyst notes appear only in the separate internal panel.
   - Confirm PDF and DOCX contain no analyst notes, source citations, or conflict wording.

Files
- `supabase/functions/generate-lead-memo/index.ts`
- `src/components/admin/data-room/MemosTab.tsx`

Technical note
- No schema migration is needed; `analyst_notes` can remain in the existing JSON content field.
- The real fix must happen before `sections` are saved. If analyst notes remain inside `sections`, they will still appear in preview and exports.
