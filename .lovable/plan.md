

# Fix Button Text Overflow

## Problem

When both documents are signed, the button shows "Request Connection and Data Room Access" which is too long and overflows the container.

## Fix

In `src/components/listing-detail/ConnectionButton.tsx` line 98, shorten the button text to "Request Connection" or "Request Deal Access". Also add `whitespace-nowrap` or `text-center` truncation protection on line 264.

### Changes

**`src/components/listing-detail/ConnectionButton.tsx`**:
- Line 98: Change text from `'Request Connection and Data Room Access'` to `'Request Deal Access'`
- Line 264: Ensure button class includes `whitespace-normal text-center` so even if text is longer, it wraps gracefully instead of overflowing

