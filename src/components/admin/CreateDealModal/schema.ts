import * as z from 'zod/v3';

// Schema for creating a buyer-seller pairing
export const createPairingSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(2000).optional(),
  stage_id: z.string().uuid('Please select a stage'),
  listing_id: z.string().uuid('Please select a listing (seller)'),
  buyer_id: z.string().uuid('Please select a buyer'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  value: z.number().min(0).optional(),
  probability: z.number().min(0).max(100).optional(),
  expected_close_date: z.date().optional(),
  assigned_to: z.union([z.string().uuid(), z.literal('')]).optional(),
});

export type CreatePairingFormData = z.infer<typeof createPairingSchema>;

export interface CreatePairingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefilledStageId?: string;
  onDealCreated?: (dealId: string) => void;
}

export interface DuplicatePairing {
  id: string;
  title: string;
  buyer_name: string | null;
  created_at: string | null;
}
