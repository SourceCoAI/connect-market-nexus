

# Indicate "Data Room Access Coming Soon" After Pending Connection Request

## Summary of All Touchpoints

After investigating the full codebase, here are **all the places** where a buyer sees their pending connection request status, and what each currently says vs. what should change:

---

### 1. Listing Sidebar (ListingSidebarActions.tsx)
**Current**: "Request pending" button (disabled) + data room tooltip says "Your connection request is pending admin approval."
**Change**: Add a subtle reassurance line below the "Request pending" button: "An admin will review your request shortly. You will receive an email once approved."

### 2. Listing Card (ListingCardTitle.tsx)
**Current**: Shows "Request Pending" badge + "View Status" link
**No change needed** - this is compact and links to My Deals where the detail lives.

### 3. My Deals / Deal Detail (MyRequests.tsx + DealStatusSection.tsx)
**Current - DealStatusSection**: When at "Review" stage (index 2): "Your interest is being presented to the owner alongside other qualified buyers. Decisions typically take 3-7 business days."
**Change**: When NDA is signed and status is pending, update explanation to mention data room access: "Your interest is being reviewed by our team. Once approved, you will receive access to the data room and deal materials. Expect to hear from us within 1-2 business days."

### 4. My Deals / DealDocumentsCard (DealDocumentsCard.tsx)
**Current**: When pending with agreements signed, shows locked docs with: "Available once your request is approved by the owner."
**Change**: More specific: "Your request is under review. Once approved, these materials will be unlocked and you will receive an email notification."

### 5. Connection Button (ConnectionButton.tsx)
**Current**: Shows "Request pending" (disabled button)
**No change needed** - minimal space, serves its purpose.

### 6. User Confirmation Email (send-connection-notification edge function)
**Current**: "Our team reviews every request and selects buyers based on fit. You will hear from us within 24 hours." + Lists what happens if selected (introduction, deal details access, team support).
**Change**: Add explicit mention of data room: "If selected, you will receive access to the data room and supporting deal materials directly on the platform."

### 7. Toast after request submission (use-connections.ts)
**Current**: "We'll review your request within 1-2 business days. You'll be notified by email. Track your request in My Deals."
**Change**: Add data room mention: "We'll review your request within 1-2 business days. Once approved, you'll receive data room access and an email notification. Track your request in My Deals."

---

## Files to Change

| File | Change |
|------|--------|
| `src/components/listing-detail/ListingSidebarActions.tsx` | Add reassurance text below "Request pending" button |
| `src/components/deals/DealStatusSection.tsx` | Update review stage explanation to mention data room access |
| `src/components/deals/DealDocumentsCard.tsx` | Update locked-docs message when pending + agreements signed |
| `src/hooks/marketplace/use-connections.ts` | Update success toast to mention data room access |
| `supabase/functions/send-connection-notification/index.ts` | Update user confirmation email to mention data room access (requires redeploy) |

## Edge Function Redeployment
`send-connection-notification` must be redeployed after the email copy change.

