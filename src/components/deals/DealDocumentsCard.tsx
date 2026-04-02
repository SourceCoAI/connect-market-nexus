/**
 * DealDocumentsCard — Agreements + Data Room preview card.
 * Uses "either doc" rule for access gating.
 */

import { useState } from 'react';
import {
  Shield,
  FileSignature,
  Check,
  FolderOpen,
  Lock,
  ArrowRight,
  FileText,
  BarChart3,
  Building2,
} from 'lucide-react';
import { AgreementSigningModal } from '@/components/pandadoc/AgreementSigningModal';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface DealDocumentsCardProps {
  dealId: string;
  requestStatus: 'pending' | 'approved' | 'rejected' | 'on_hold';
  ndaSigned: boolean;
  feeCovered: boolean;
  feeStatus?: string;
  onViewDocuments?: () => void;
}

export function DealDocumentsCard({
  dealId,
  requestStatus,
  ndaSigned,
  feeCovered,
  feeStatus,
  onViewDocuments,
}: DealDocumentsCardProps) {
  const { user } = useAuth();
  const [signingOpen, setSigningOpen] = useState(false);
  const [signingType, setSigningType] = useState<'nda' | 'fee_agreement'>('nda');

  const openSigning = (type: 'nda' | 'fee_agreement') => {
    setSigningType(type);
    setSigningOpen(true);
  };

  const hasAnyAgreement = ndaSigned || feeCovered;

  const { data: access } = useQuery({
    queryKey: ['buyer-data-room-access', dealId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('data_room_access')
        .select('can_view_teaser, can_view_full_memo, can_view_data_room, fee_agreement_override')
        .eq('deal_id', dealId)
        .eq('marketplace_user_id', user?.id ?? '')
        .is('revoked_at', null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!dealId && !!user?.id && requestStatus !== 'pending',
  });

  const { data: docCount = 0 } = useQuery({
    queryKey: ['buyer-data-room-doc-count', dealId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('data_room_documents')
        .select('id', { count: 'exact', head: true })
        .eq('deal_id', dealId)
        .eq('status', 'active');
      if (error) throw error;
      return count || 0;
    },
    enabled: !!dealId && !!access,
  });

  const { data: memoCount = 0 } = useQuery({
    queryKey: ['buyer-published-memo-count', dealId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('lead_memos')
        .select('id', { count: 'exact', head: true })
        .eq('deal_id', dealId)
        .eq('status', 'published');
      if (error) throw error;
      return count || 0;
    },
    enabled: !!dealId && !!access,
  });

  const hasAccess =
    access && (access.can_view_teaser || access.can_view_full_memo || access.can_view_data_room);
  const totalDocs = docCount + memoCount;
  const docsLocked = requestStatus === 'pending' || !hasAccess;

  return (
    <>
      <div className="rounded-lg border border-[#F0EDE6] bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-[#F0EDE6]">
          <h3 className="text-[10px] font-semibold text-[#0E101A]/30 uppercase tracking-[0.12em]">
            Documents & Agreements
          </h3>
        </div>

        <div className="px-5 py-4 space-y-3.5">
          {/* NDA row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Shield
                className={cn('h-4 w-4', ndaSigned ? 'text-emerald-600' : 'text-[#8B6F47]')}
              />
              <span className="text-[13px] text-[#0E101A]/70">NDA</span>
            </div>
            {ndaSigned ? (
              <div className="flex items-center gap-1.5">
                <Check className="h-3 w-3 text-emerald-600" />
                <span className="text-[12px] font-medium text-emerald-700">Signed</span>
              </div>
            ) : (
              <button
                onClick={() => openSigning('nda')}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-[#0E101A] text-white hover:bg-[#0E101A]/85 transition-colors"
              >
                Request <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Fee Agreement row */}
          {/* Fee Agreement row — always visible */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <FileSignature
                className={cn('h-4 w-4', feeCovered ? 'text-emerald-600' : 'text-[#8B6F47]')}
              />
              <span className="text-[13px] text-[#0E101A]/70">Fee Agreement</span>
            </div>
            {feeCovered ? (
              <div className="flex items-center gap-1.5">
                <Check className="h-3 w-3 text-emerald-600" />
                <span className="text-[12px] font-medium text-emerald-700">Signed</span>
              </div>
            ) : (
              <button
                onClick={() => openSigning('fee_agreement')}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-[#0E101A] text-white hover:bg-[#0E101A]/85 transition-colors"
              >
                Request <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="border-t border-[#F0EDE6]" />

          {/* Data Room section */}
          <div className="flex items-center gap-2.5 mb-1">
            <FolderOpen
              className={cn('h-4 w-4', hasAccess ? 'text-[#0E101A]/50' : 'text-[#0E101A]/20')}
            />
            <span className="text-[10px] font-semibold text-[#0E101A]/30 uppercase tracking-[0.12em]">
              Data Room
            </span>
          </div>

          {docsLocked ? (
            <div className="space-y-2 pl-[30px]">
              <div className="flex items-center gap-2.5 opacity-40">
                <Building2 className="h-3.5 w-3.5 text-[#0E101A]/50 shrink-0" />
                <span className="text-[12px] text-[#0E101A]/60">Confidential Company Profile</span>
                <Lock className="h-3 w-3 text-[#0E101A]/30 ml-auto shrink-0" />
              </div>
              <div className="flex items-center gap-2.5 opacity-40">
                <FileText className="h-3.5 w-3.5 text-[#0E101A]/50 shrink-0" />
                <span className="text-[12px] text-[#0E101A]/60">Deal Memorandum / CIM</span>
                <Lock className="h-3 w-3 text-[#0E101A]/30 ml-auto shrink-0" />
              </div>
              <div className="flex items-center gap-2.5 opacity-40">
                <BarChart3 className="h-3.5 w-3.5 text-[#0E101A]/50 shrink-0" />
                <span className="text-[12px] text-[#0E101A]/60">Detailed Financial Statements</span>
                <Lock className="h-3 w-3 text-[#0E101A]/30 ml-auto shrink-0" />
              </div>
              <p className="text-[11px] text-[#8B6F47] mt-2 font-medium">
                {!hasAnyAgreement
                  ? 'Sign an agreement (NDA or Fee Agreement) to begin unlocking these materials.'
                  : requestStatus === 'pending'
                    ? 'Available once your request is approved by the owner.'
                    : 'Documents are being prepared by our team.'}
              </p>
            </div>
          ) : (
            <div className="pl-[30px] space-y-2">
              <p className="text-[13px] text-[#0E101A]/60">
                {totalDocs > 0
                  ? `${totalDocs} document${totalDocs !== 1 ? 's' : ''} available`
                  : 'No documents shared yet'}
              </p>
              {totalDocs > 0 && onViewDocuments && (
                <button
                  onClick={onViewDocuments}
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#0E101A] hover:text-[#0E101A]/70 transition-colors"
                >
                  View Documents <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <AgreementSigningModal
        open={signingOpen}
        onOpenChange={setSigningOpen}
        documentType={signingType}
      />
    </>
  );
}
