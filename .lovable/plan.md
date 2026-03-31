

# Add "Marketplace Users Only" Toggle to Document Tracking

## What It Does

Adds a toggle next to the status filter dropdown that, when enabled, shows only firms that have at least one registered marketplace user (i.e., a `firm_member` with `member_type === 'marketplace_user'` and a linked `user_id`). This filters out firms that only have lead-based members who never signed up on the platform.

## Change — Single File

**`src/pages/admin/DocumentTrackingPage.tsx`**

1. Add state: `const [marketplaceOnly, setMarketplaceOnly] = useState(false);`

2. Add a toggle switch (using the existing `Switch` component from shadcn) in the filter bar, between the search input and the status dropdown. Label: "Marketplace Users Only".

3. In the `filteredFirms` useMemo, add an early filter step:
   ```ts
   if (marketplaceOnly) {
     result = result.filter(f =>
       f.members.some(m => m.member_type === 'marketplace_user' && m.user_id)
     );
   }
   ```

4. Update the stats cards to reflect the filtered count when the toggle is active (the existing `totalFirms` stays as the unfiltered count; the filtered count shows contextually).

5. Add `marketplaceOnly` to the `useMemo` dependency array.

