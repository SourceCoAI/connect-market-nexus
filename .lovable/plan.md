

## My Deals -- Left Panel + Signing + Data Room Polish

### Problems Identified

1. **Left panel sidebar still feels heavy** -- The category icon boxes (32px dark squares), the sort dropdown, and the overall spacing create visual noise. The "General Inquiry" card also still shows with an "Internal" label and "0" which looks broken.

2. **Document signing not prominent enough** -- The AccountDocumentsBanner at the top is easy to miss. The DealDocumentsCard shows signing buttons but it's buried in the overview grid below the fold. A buyer who hasn't signed NDA should see it front-and-center, impossible to miss.

3. **Data Room preview is too vague** -- Currently says "Available after your request is approved" with no specifics. It should tease what becomes available: the actual company name, a deal memo/CIM, and confidential details -- giving buyers motivation to sign and complete the process.

4. **"General Inquiry" sidebar card** -- Shows "Internal" category and "$0" EBITDA which looks broken. Needs special handling.

### Changes

#### 1. Sidebar Cards (`DealPipelineCard.tsx`) -- Cleaner

- Remove the icon box entirely (the 32x32 dark square is heavy). Use a simple thin left-edge color indicator instead
- Tighter padding: reduce from `px-4 py-3.5` to `px-3.5 py-3`
- Row 1: Just the title, bold, truncated, with unread dot
- Row 2: Category + EBITDA in lighter text
- Row 3: Status label + time
- For "General Inquiry" type listings (no category, $0 EBITDA): show just "General Inquiry" with no financial data
- Selected state: clean `bg-[#FAFAF8]` background + left gold bar (keep) + slightly darker border
- Remove the `border` on each card -- use hover backgrounds only for cleaner look

#### 2. Sidebar Header -- Simpler

- Remove the sort dropdown (it adds clutter, most buyers have 1-3 deals)
- Just show "DEALS" label + count badge
- Or simplify the sort to a tiny icon-only toggle

#### 3. Action Card (`DealActionCard.tsx`) -- Make signing unmissable

- When NDA is unsigned: use a full gold background with large text and a prominent black button
- Add a subtitle explaining what signing unlocks: "Once signed, you'll receive access to the company name, confidential deal memo, and detailed financials"
- Make the CTA button larger (full width on mobile, right-aligned on desktop)

#### 4. Documents Card (`DealDocumentsCard.tsx`) -- Tease Data Room contents

- When request is pending and NDA not signed: Show what's waiting behind the gate:
  - "Confidential Company Information" (locked icon)
  - "Deal Memorandum / CIM" (locked icon)  
  - "Detailed Financial Statements" (locked icon)
  - Subtitle: "Sign your NDA and complete the review process to unlock"
- When approved with access: Show actual document names and counts
- When approved without access yet: "Documents are being prepared by our team"
- Add a visual distinction -- the locked items should feel premium and exclusive, not just greyed out

#### 5. Remove AccountDocumentsBanner from top

- The banner at the very top of the container is redundant now that the DealActionCard and DealDocumentsCard both handle signing prominently
- Removing it simplifies the layout and removes duplicate signing triggers

#### 6. Detail Header (`DealDetailHeader.tsx`) -- Minor fix

- Handle edge case where listing has no EBITDA (General Inquiry) gracefully

### Files to Modify

| File | Change |
|------|--------|
| `src/components/deals/DealPipelineCard.tsx` | Remove icon box, tighter layout, handle General Inquiry edge case, cleaner cards |
| `src/components/deals/DealActionCard.tsx` | Bolder signing CTA with description of what signing unlocks |
| `src/components/deals/DealDocumentsCard.tsx` | Tease locked data room contents (company name, memo, financials), better gating copy |
| `src/pages/MyRequests.tsx` | Remove AccountDocumentsBanner, simplify sidebar header (remove or minimize sort dropdown) |

### Technical Notes

- No data layer changes needed
- The `internal_company_name` field exists on listings but should NOT be exposed to buyers pre-approval -- the teaser should say "Confidential Company Information" generically
- All existing signing modal integration (`AgreementSigningModal`) stays the same
- The `DealInfoCard`, `DealStatusSection`, `DealMessageEditor`, `BuyerProfileStatus` components remain unchanged

