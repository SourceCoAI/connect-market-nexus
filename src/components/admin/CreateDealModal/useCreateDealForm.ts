import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useDealStages, useCreateDeal } from '@/hooks/admin/use-deals';
import { useListingsQuery } from '@/hooks/admin/listings/use-listings-query';
import { useAdminProfiles } from '@/hooks/admin/use-admin-profiles';
import { useMarketplaceUsers } from '@/hooks/admin/use-marketplace-users';
import { useMarketplaceCompanies } from '@/hooks/admin/use-marketplace-companies';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { logDealActivity } from '@/lib/deal-activity-logger';
import { useToast } from '@/hooks/use-toast';
import { createDealSchema, CreateDealFormData, DuplicateDeal } from './schema';

export function useCreateDealForm(
  open: boolean,
  onOpenChange: (open: boolean) => void,
  prefilledStageId?: string,
  onDealCreated?: (dealId: string) => void,
) {
  const { data: stages } = useDealStages();
  const { data: listings } = useListingsQuery('active', open);
  const { data: adminProfilesMap } = useAdminProfiles();
  const { data: marketplaceUsers } = useMarketplaceUsers();
  const { data: marketplaceCompanies } = useMarketplaceCompanies();
  const adminUsers = adminProfilesMap ? Object.values(adminProfilesMap) : [];
  const createDealMutation = useCreateDeal();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [duplicates, setDuplicates] = useState<DuplicateDeal[]>([]);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [pendingData, setPendingData] = useState<CreateDealFormData | null>(null);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
  const [isSelectingUser, setIsSelectingUser] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedCompanyName, setSelectedCompanyName] = useState<string | null>(null);
  const [autoPopulatedFrom, setAutoPopulatedFrom] = useState<{
    source: 'user' | 'company';
    name: string;
    email: string;
  } | null>(null);

  const form = useForm<CreateDealFormData>({
    resolver: zodResolver(createDealSchema as never),
    defaultValues: {
      title: '',
      description: '',
      stage_id: prefilledStageId || stages?.[0]?.id || '',
      listing_id: '',
      contact_name: '',
      contact_email: '',
      contact_company: '',
      contact_phone: '',
      contact_role: '',
      priority: 'medium',
      value: undefined,
      probability: 50,
      expected_close_date: undefined,
      assigned_to: undefined,
    },
  });

  // Update stage when prefilledStageId changes
  useEffect(() => {
    if (prefilledStageId) {
      form.setValue('stage_id', prefilledStageId);
    }
  }, [prefilledStageId, form]);

  // Watch for stage changes to auto-populate probability
  const selectedStageId = form.watch('stage_id');

  useEffect(() => {
    if (selectedStageId && stages) {
      const selectedStage = stages.find((stage) => stage.id === selectedStageId);
      if (selectedStage && selectedStage.default_probability !== undefined) {
        form.setValue('probability', selectedStage.default_probability);
      }
    }
  }, [selectedStageId, stages, form]);

  // Check for duplicates — look in connection_requests by lead_email + listing_id
  const checkDuplicates = async (email: string, listingId: string): Promise<DuplicateDeal[]> => {
    try {
      const { data, error } = await supabase
        .from('connection_requests')
        .select(
          'id, listing_id, lead_name, created_at, deal_pipeline:deal_pipeline!deal_pipeline_connection_request_id_fkey(id, title)',
        )
        .eq('lead_email', email)
        .eq('listing_id', listingId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      // Map to DuplicateDeal shape
      return (data || [])
        .filter((cr: Record<string, unknown>) => cr.deal_pipeline)
        .map((cr: Record<string, unknown>) => {
          const dp = cr.deal_pipeline as Record<string, unknown>;
          return {
            id: dp.id as string,
            title: (dp.title as string) || '',
            contact_name: (cr.lead_name as string) || null,
            created_at: cr.created_at as string,
          };
        });
    } catch (error) {
      console.error('Error checking duplicates:', error);
      return [];
    }
  };

  const handleFormSubmit = async (data: CreateDealFormData) => {
    // Check for duplicates
    setIsCheckingDuplicates(true);
    const foundDuplicates = await checkDuplicates(data.contact_email, data.listing_id);
    setIsCheckingDuplicates(false);

    if (foundDuplicates.length > 0) {
      setDuplicates(foundDuplicates);
      setPendingData(data);
      setShowDuplicateWarning(true);
      return;
    }

    // No duplicates, proceed with creation
    await createDeal(data);
  };

  const createDeal = async (data: CreateDealFormData) => {
    try {
      let connectionRequestId = null;

      // If user was selected from marketplace, create connection request first
      if (selectedUserId && data.listing_id) {
        // Check for existing connection request
        const { data: existingRequests, error: checkError } = await supabase
          .from('connection_requests')
          .select('id')
          .eq('user_id', selectedUserId)
          .eq('listing_id', data.listing_id)
          .limit(1);

        if (checkError) throw checkError;

        if (existingRequests && existingRequests.length > 0) {
          // Use existing connection request
          connectionRequestId = existingRequests[0].id;
          toast({
            title: 'Using Existing Connection',
            description: 'This user already has a connection request for this listing.',
          });
        } else {
          // Create new connection request
          const { data: newConnectionRequest, error: crError } = await supabase
            .from('connection_requests')
            .insert({
              user_id: selectedUserId,
              listing_id: data.listing_id,
              status: 'approved',
              source: 'manual',
              user_message: data.description || 'Manual connection created by admin',
              source_metadata: {
                created_by_admin: true,
                admin_id: (await supabase.auth.getUser()).data.user?.id,
                created_via: 'deal_creation_modal',
                title: data.title,
              },
            })
            .select()
            .single();

          if (crError) throw crError;
          connectionRequestId = newConnectionRequest.id;
        }
      }

      // Create buyer contact record if we have contact info and no marketplace user
      let buyerContactId: string | null = null;
      if (data.contact_email && !selectedUserId) {
        const nameParts = (data.contact_name || '').split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        // Upsert contact by email
        const { data: contact } = await supabase
          .from('contacts')
          .upsert(
            {
              first_name: firstName,
              last_name: lastName,
              email: data.contact_email.toLowerCase().trim(),
              phone: data.contact_phone || null,
              title: data.contact_role || null,
              contact_type: 'buyer',
              source: 'manual_deal_creation',
            },
            { onConflict: 'email' },
          )
          .select('id')
          .single();

        if (contact) {
          buyerContactId = contact.id;
        }
      }

      // Strip contact_* fields — they no longer exist on deal_pipeline
      const {
        contact_name: _contact_name,
        contact_email: _contact_email,
        contact_company: _contact_company,
        contact_phone: _contact_phone,
        contact_role: _contact_role,
        ...dealFields
      } = data;

      const payload: Record<string, unknown> = {
        ...dealFields,
        source: 'manual',
        nda_status: 'not_sent',
        fee_agreement_status: 'not_sent',
        buyer_priority_score: 0,
        assigned_to: data.assigned_to && data.assigned_to !== '' ? data.assigned_to : null,
        connection_request_id: connectionRequestId,
        buyer_contact_id: buyerContactId,
      };
      const newDeal = await createDealMutation.mutateAsync(payload);

      // Phase 4: Auto-create connection request associations for same company
      if (connectionRequestId && data.contact_company) {
        try {
          // Find profiles with this company
          const { data: companyProfiles, error: companyProfilesError } = await supabase
            .from('profiles')
            .select('id')
            .eq('company', data.contact_company)
            .eq('approval_status', 'approved');
          if (companyProfilesError) throw companyProfilesError;

          if (companyProfiles && companyProfiles.length > 0) {
            const userIds = companyProfiles.map((p) => p.id);

            // Find other connection requests from users in this company OR with same company name
            const { data: sameCompanyRequests, error: sameCompanyRequestsError } = await supabase
              .from('connection_requests')
              .select('id')
              .neq('id', connectionRequestId)
              .or(`user_id.in.(${userIds.join(',')}),lead_company.eq.${data.contact_company}`);
            if (sameCompanyRequestsError) throw sameCompanyRequestsError;

            if (sameCompanyRequests && sameCompanyRequests.length > 0) {
              // Create bidirectional associations
              const associations = sameCompanyRequests.flatMap((req) => [
                {
                  primary_request_id: connectionRequestId,
                  related_request_id: req.id,
                  relationship_type: 'same_company',
                  relationship_metadata: {
                    company_name: data.contact_company,
                    auto_created: true,
                    created_at: new Date().toISOString(),
                  },
                },
                {
                  primary_request_id: req.id,
                  related_request_id: connectionRequestId,
                  relationship_type: 'same_company',
                  relationship_metadata: {
                    company_name: data.contact_company,
                    auto_created: true,
                    created_at: new Date().toISOString(),
                  },
                },
              ]);

              const { error: assocError } = await supabase
                .from('connection_request_contacts')
                .upsert(associations, {
                  onConflict: 'primary_request_id,related_request_id',
                });

              if (assocError) {
                console.error('[CreateDealModal] Failed to create associations:', assocError);
              }
            }
          }
        } catch (err) {
          console.error('[CreateDealModal] Error creating associations:', err);
          // Don't fail the entire deal creation if associations fail
        }
      }

      // Log activity
      if (newDeal?.id) {
        await logDealActivity({
          dealId: newDeal.id,
          activityType: 'deal_created',
          title: 'Deal Created',
          description: `Deal "${data.title}" was created manually`,
        });
      }

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['deal-stages'] });
      queryClient.invalidateQueries({ queryKey: ['connection-requests'] });
      queryClient.invalidateQueries({ queryKey: ['associated-requests'] }); // Invalidate all associated requests
      if (selectedUserId) {
        queryClient.invalidateQueries({ queryKey: ['user-connection-requests', selectedUserId] });
      }

      // Show success toast (useCreateDeal already shows one, so we suppress it)
      toast({
        title: 'Deal Created',
        description: `"${data.title}" has been added to your pipeline.`,
      });

      // Auto-select the newly created deal
      if (newDeal?.id && onDealCreated) {
        onDealCreated(newDeal.id);
      }

      // Reset and close
      form.reset();
      setIsSelectingUser(false);
      setSelectedUserId(null);
      onOpenChange(false);
    } catch (error) {
      // Error toast already shown by useCreateDeal
    }
  };

  const handleCreateAnyway = async () => {
    if (pendingData) {
      setShowDuplicateWarning(false);
      await createDeal(pendingData);
      setPendingData(null);
      setDuplicates([]);
    }
  };

  const handleCancelDuplicate = () => {
    setShowDuplicateWarning(false);
    setPendingData(null);
    setDuplicates([]);
  };

  // Handle user selection
  const handleUserSelect = (userId: string) => {
    const user = marketplaceUsers?.find((u) => u.id === userId);
    if (user) {
      setSelectedUserId(userId);
      form.setValue(
        'contact_name',
        `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
      );
      form.setValue('contact_email', user.email);
      form.setValue('contact_company', user.company || '');
    }
  };

  const handleToggleUserSelection = () => {
    if (isSelectingUser) {
      // Switching back to manual entry
      setSelectedUserId(null);
      setSelectedCompanyName(null);
      form.setValue('contact_name', '');
      form.setValue('contact_email', '');
      form.setValue('contact_company', '');
      form.setValue('contact_phone', '');
      form.setValue('contact_role', '');
    }
    setIsSelectingUser(!isSelectingUser);
  };

  // Handle company selection
  const handleCompanySelect = (companyName: string) => {
    setSelectedCompanyName(companyName);
    form.setValue('contact_company', companyName);

    // Auto-populate from profile template if existing company
    const selectedCompany = marketplaceCompanies?.find((c) => c.value === companyName);
    if (selectedCompany?.profileTemplate) {
      const template = selectedCompany.profileTemplate;

      // Only auto-fill if field is empty
      if (!form.getValues('contact_phone') && template.phone_number) {
        form.setValue('contact_phone', template.phone_number);
      }

      setAutoPopulatedFrom({
        source: 'company',
        name: companyName,
        email: template.sampleUserEmail,
      });
    }
  };

  // Helper function to generate comprehensive search terms with prefixes
  const generateSearchTerms = (words: string[]): string => {
    const terms = new Set<string>();

    words.forEach((word) => {
      const cleaned = word.toLowerCase().trim();
      if (!cleaned) return;

      // Add full word
      terms.add(cleaned);

      // Add progressive prefixes (for "Tucker's" -> "t", "tu", "tuc", "tuck", etc.)
      for (let i = 1; i <= cleaned.length; i++) {
        terms.add(cleaned.substring(0, i));
      }
    });

    return Array.from(terms).join(' ');
  };

  // Format user options for combobox
  const userOptions = React.useMemo(() => {
    if (!marketplaceUsers || marketplaceUsers.length === 0) {
      return [];
    }

    return marketplaceUsers.map((user) => {
      const firstName = user.first_name || '';
      const lastName = user.last_name || '';
      const name = `${firstName} ${lastName}`.trim() || user.email;
      const buyerType = user.buyer_type ? ` - ${user.buyer_type}` : '';
      const company = user.company ? ` (${user.company})` : '';

      // Generate comprehensive search terms
      const searchParts = [
        firstName,
        lastName,
        name,
        user.email,
        user.company || '',
        user.buyer_type || '',
        // Split company name into words for better matching
        ...(user.company ? user.company.split(/\s+/) : []),
      ].filter(Boolean);

      return {
        value: user.id,
        label: `${name} - ${user.email}${buyerType}${company}`,
        searchTerms: generateSearchTerms(searchParts),
      };
    });
  }, [marketplaceUsers]);

  return {
    form,
    stages,
    listings,
    adminUsers,
    marketplaceUsers,
    marketplaceCompanies,
    createDealMutation,
    duplicates,
    showDuplicateWarning,
    setShowDuplicateWarning,
    isCheckingDuplicates,
    isSelectingUser,
    selectedUserId,
    selectedCompanyName,
    autoPopulatedFrom,
    setAutoPopulatedFrom,
    userOptions,
    handleFormSubmit,
    handleCreateAnyway,
    handleCancelDuplicate,
    handleUserSelect,
    handleToggleUserSelection,
    handleCompanySelect,
  };
}
