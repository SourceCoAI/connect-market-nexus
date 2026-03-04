

# Fix: "Failed to open deal page" and Missing Test Lead

## Problem
Two issues identified:

1. **"Failed to open deal page" error**: The `listings` table has **no INSERT RLS policy**. When you click a lead, the code tries to create a listing row via `buildListingFromLead()`, but Supabase blocks the insert silently due to RLS. The error is caught and shown as a toast.

2. **Test lead not visible**: The "Collision Calculator #1" test lead (`unique-xyz-test-789@example.com`) exists in the DB but may be filtered out by the domain deduplication logic (its website is `test.com`). However, it should still appear since it has a unique domain. This is a secondary concern — once the INSERT policy is added, all leads will be clickable.

## Fix

### 1. Add INSERT RLS Policy on `listings`
Create a migration that adds an INSERT policy for authenticated admin users. Since this is an admin-only action (pushing valuation leads to deals), it should be gated by the `has_role` function:

```sql
CREATE POLICY "Admins can insert listings"
  ON public.listings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
```

This single change fixes the "Failed to open deal page" error — the listing insert will succeed and the app will navigate to the deal page.

### 2. No Other Changes Needed
The lead data, filtering, sorting, and display logic are all working correctly. The only blocker was the missing RLS policy preventing listing creation.

