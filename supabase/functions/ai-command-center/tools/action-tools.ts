/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase client used with untyped tables */
/**
 * Action Tools (Write-Back)
 * Create tasks, add notes, update stages, grant data room access.
 * These tools MODIFY data — some require user confirmation.
 */

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;
import type { ClaudeTool } from '../../_shared/claude-client.ts';
import type { ToolResult } from './index.ts';

// ---------- Tool definitions ----------

export const actionTools: ClaudeTool[] = [
  {
    name: 'create_deal_task',
    description:
      'Create a new task/to-do for a deal. Can assign to a team member with priority and due date.',
    input_schema: {
      type: 'object',
      properties: {
        deal_id: { type: 'string', description: 'The deal/listing UUID' },
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Task description/details' },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
          description: 'Task priority (default "medium")',
        },
        due_date: { type: 'string', description: 'Due date in ISO format (YYYY-MM-DD)' },
        assigned_to: {
          type: 'string',
          description: 'User ID to assign to. Use "CURRENT_USER" for self-assignment.',
        },
      },
      required: ['deal_id', 'title'],
    },
  },
  {
    name: 'complete_deal_task',
    description: 'Mark a deal task as completed.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'The task UUID to complete' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'add_deal_note',
    description: 'Add a note/comment to a deal activity log.',
    input_schema: {
      type: 'object',
      properties: {
        deal_id: { type: 'string', description: 'The deal/listing UUID' },
        title: { type: 'string', description: 'Note title/subject' },
        content: { type: 'string', description: 'Note content' },
        activity_type: {
          type: 'string',
          description:
            'Activity type (default "note"). Options: note, call, email, meeting, status_change',
        },
      },
      required: ['deal_id', 'title', 'content'],
    },
  },
  {
    name: 'log_deal_activity',
    description: 'Log a deal activity event (call, meeting, outreach, status change).',
    input_schema: {
      type: 'object',
      properties: {
        deal_id: { type: 'string', description: 'The deal/listing UUID' },
        activity_type: {
          type: 'string',
          description:
            'Type of activity: note, call, email, meeting, outreach, status_change, data_room, scoring',
        },
        title: { type: 'string', description: 'Activity title' },
        description: { type: 'string', description: 'Activity description' },
        metadata: { type: 'object', description: 'Additional structured metadata' },
      },
      required: ['deal_id', 'activity_type', 'title'],
    },
  },
  {
    name: 'update_deal_stage',
    description:
      'Update the remarketing status/stage of a deal. REQUIRES CONFIRMATION. Valid stages: sourced, contacted, interested, nda_sent, nda_signed, data_room_open, loi_submitted, under_exclusivity, closed, passed.',
    input_schema: {
      type: 'object',
      properties: {
        deal_id: { type: 'string', description: 'The deal/listing UUID' },
        new_stage: { type: 'string', description: 'New remarketing status' },
        reason: { type: 'string', description: 'Reason for the stage change' },
      },
      required: ['deal_id', 'new_stage'],
    },
  },
  {
    name: 'reassign_deal_task',
    description:
      'Reassign a deal task to a different team member. REQUIRES CONFIRMATION. Use when the user says "reassign this task to [person]" or "give this task to [name]".',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'The task UUID to reassign' },
        new_assignee_id: { type: 'string', description: 'User ID of the new assignee' },
        new_assignee_email: {
          type: 'string',
          description: 'Email of the new assignee (alternative to ID — will look up user)',
        },
        reason: { type: 'string', description: 'Reason for reassignment' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'convert_to_pipeline_deal',
    description:
      'Convert a remarketing buyer match into an active pipeline deal. Creates a new deal record linked to the buyer and listing with initial setup (firm agreement, stage, etc.). REQUIRES CONFIRMATION. Use when the user says "convert this to a deal", "move to pipeline", or "create a deal for this buyer".',
    input_schema: {
      type: 'object',
      properties: {
        listing_id: { type: 'string', description: 'The source listing UUID' },
        buyer_id: { type: 'string', description: 'The remarketing buyer UUID' },
        initial_stage: { type: 'string', description: 'Initial stage name (default "contacted")' },
        notes: { type: 'string', description: 'Notes about the conversion' },
      },
      required: ['listing_id', 'buyer_id'],
    },
  },
  {
    name: 'grant_data_room_access',
    description:
      "Grant a buyer access to a deal's data room. REQUIRES CONFIRMATION. Creates access record and can set permission levels.",
    input_schema: {
      type: 'object',
      properties: {
        deal_id: { type: 'string', description: 'The deal/listing UUID' },
        buyer_id: { type: 'string', description: 'The remarketing buyer UUID' },
        buyer_name: { type: 'string', description: 'Buyer name (for display)' },
        buyer_email: { type: 'string', description: 'Buyer contact email' },
        access_level: {
          type: 'string',
          enum: ['teaser', 'memo', 'full'],
          description: 'Level of access (default "teaser")',
        },
      },
      required: ['deal_id', 'buyer_id', 'buyer_name', 'buyer_email'],
    },
  },
];

// ---------- Executor ----------

export async function executeActionTool(
  supabase: SupabaseClient,
  toolName: string,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  switch (toolName) {
    case 'create_deal_task':
      return createDealTask(supabase, args, userId);
    case 'complete_deal_task':
      return completeDealTask(supabase, args, userId);
    case 'add_deal_note':
      return addDealNote(supabase, args, userId);
    case 'log_deal_activity':
      return logDealActivity(supabase, args, userId);
    case 'update_deal_stage':
      return updateDealStage(supabase, args, userId);
    case 'reassign_deal_task':
      return reassignDealTask(supabase, args, userId);
    case 'convert_to_pipeline_deal':
      return convertToPipelineDeal(supabase, args, userId);
    case 'grant_data_room_access':
      return grantDataRoomAccess(supabase, args, userId);
    default:
      return { error: `Unknown action tool: ${toolName}` };
  }
}

// ---------- Implementations ----------

async function createDealTask(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const dealId = args.deal_id as string;
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  // Write to the unified daily_standup_tasks table (single source of truth)
  const { data, error } = await (supabase as any)
    .from('daily_standup_tasks')
    .insert({
      title: args.title as string,
      description: (args.description as string) || null,
      task_type: 'other',
      entity_type: 'deal',
      entity_id: dealId,
      deal_id: dealId,
      deal_reference: (args.title as string) || null,
      due_date: (args.due_date as string) || tomorrow,
      priority: (args.priority as string) || 'medium',
      assignee_id: (args.assigned_to as string) || userId,
      source: 'chatbot',
      status: 'pending_approval',
      is_manual: false,
      priority_score: 50,
      extraction_confidence: 'high',
      needs_review: true,
      created_by: userId,
    })
    .select('id, title, status, priority, due_date, assignee_id')
    .single();

  if (error) return { error: error.message };

  // Log the activity
  await (supabase as any).from('deal_activities').insert({
    deal_id: dealId,
    activity_type: 'task_created',
    title: `Task created: ${args.title}`,
    description: `AI Command Center created task "${args.title}" with priority ${args.priority || 'medium'}`,
    admin_id: userId,
    metadata: { source: 'ai_command_center', task_id: data.id },
  });

  return {
    data: {
      task: { ...data, assigned_to: data.assignee_id },
      message: `Task "${data.title}" created and sent for approval. A team member must review it in the task dashboard.`,
      requires_approval: true,
    },
  };
}

async function completeDealTask(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const { data, error } = await (supabase as any)
    .from('daily_standup_tasks')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      completed_by: userId,
    })
    .eq('id', args.task_id as string)
    .select('id, title, entity_id, status, completed_at')
    .single();

  if (error) return { error: error.message };

  // Log the activity (entity_id is the deal_id for deal tasks)
  if (data.entity_id) {
    await (supabase as any).from('deal_activities').insert({
      deal_id: data.entity_id,
      activity_type: 'task_completed',
      title: `Task completed: ${data.title}`,
      admin_id: userId,
      metadata: { source: 'ai_command_center', task_id: data.id },
    });
  }

  return {
    data: {
      task: { ...data, deal_id: data.entity_id },
      message: `Task "${data.title}" marked as completed`,
    },
  };
}

async function addDealNote(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const activityType = (args.activity_type as string) || 'note';

  const { data, error } = await (supabase as any)
    .from('deal_activities')
    .insert({
      deal_id: args.deal_id as string,
      activity_type: activityType,
      title: args.title as string,
      description: args.content as string,
      admin_id: userId,
      metadata: { source: 'ai_command_center' },
    })
    .select('id, title, activity_type, created_at')
    .single();

  if (error) return { error: error.message };

  return {
    data: {
      activity: data,
      message: `Note added: "${data.title}"`,
    },
  };
}

async function logDealActivity(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const { data, error } = await (supabase as any)
    .from('deal_activities')
    .insert({
      deal_id: args.deal_id as string,
      activity_type: args.activity_type as string,
      title: args.title as string,
      description: (args.description as string) || null,
      admin_id: userId,
      metadata: {
        ...((args.metadata as Record<string, unknown>) || {}),
        source: 'ai_command_center',
      },
    })
    .select('id, title, activity_type, created_at')
    .single();

  if (error) return { error: error.message };

  return {
    data: {
      activity: data,
      message: `Activity logged: "${data.title}" (${data.activity_type})`,
    },
  };
}

/**
 * Update deal stage via the deal_stages lookup table.
 * Updated Feb 2026: The pipeline UI reads deals.stage_id (FK to deal_stages), NOT listings.remarketing_status.
 * We now look up the stage by name in deal_stages and update deals.stage_id accordingly.
 */
async function updateDealStage(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const dealId = args.deal_id as string;
  const newStage = args.new_stage as string;

  // Look up the target stage in deal_stages
  const { data: stageRecord, error: stageError } = await (supabase as any)
    .from('deal_stages')
    .select('id, name')
    .ilike('name', newStage)
    .limit(1)
    .single();

  if (stageError || !stageRecord) {
    // Fetch valid stage names to return a helpful error
    const { data: validStages } = await (supabase as any)
      .from('deal_stages')
      .select('name')
      .order('display_order', { ascending: true });
    const stageNames = (validStages || []).map((s: { name: string }) => s.name);
    return {
      error: `Invalid stage "${newStage}". Valid stages are: ${stageNames.join(', ')}`,
    };
  }

  // Get current deal info including current stage
  const { data: current } = await (supabase as any)
    .from('deal_pipeline')
    .select('stage_id, title')
    .eq('id', dealId)
    .single();

  // If deal not found in deals table, try listings for backward compat
  let dealTitle = current?.title;
  const oldStageId = current?.stage_id;
  if (!current) {
    const { data: listing } = await (supabase as any)
      .from('listings')
      .select('title, remarketing_status')
      .eq('id', dealId)
      .single();
    dealTitle = listing?.title;
  }

  // Look up old stage name for logging
  let oldStageName = 'unknown';
  if (oldStageId) {
    const { data: oldStageRecord } = await (supabase as any)
      .from('deal_stages')
      .select('name')
      .eq('id', oldStageId)
      .single();
    if (oldStageRecord) oldStageName = oldStageRecord.name;
  }

  // Update deals.stage_id
  const { error: updateError } = await (supabase as any)
    .from('deal_pipeline')
    .update({ stage_id: stageRecord.id, updated_at: new Date().toISOString() })
    .eq('id', dealId);

  if (updateError) return { error: updateError.message };

  // Log the activity
  await (supabase as any).from('deal_activities').insert({
    deal_id: dealId,
    activity_type: 'status_change',
    title: `Stage changed: ${oldStageName} → ${stageRecord.name}`,
    description: args.reason
      ? `Reason: ${args.reason}`
      : `AI Command Center updated stage from ${oldStageName} to ${stageRecord.name}`,
    admin_id: userId,
    metadata: {
      source: 'ai_command_center',
      old_stage: oldStageName,
      old_stage_id: oldStageId,
      new_stage: stageRecord.name,
      new_stage_id: stageRecord.id,
    },
  });

  return {
    data: {
      deal_id: dealId,
      deal_title: dealTitle,
      old_stage: oldStageName,
      new_stage: stageRecord.name,
      new_stage_id: stageRecord.id,
      message: `Deal "${dealTitle}" stage updated: ${oldStageName} → ${stageRecord.name}`,
    },
  };
}

/**
 * Grant data room access to a buyer.
 * Updated Feb 2026: Writes to data_room_access only (deal_data_room_access is legacy).
 * Populates contact_id by looking up the buyer's primary contact in the unified contacts table.
 */
async function grantDataRoomAccess(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const dealId = args.deal_id as string;
  const buyerId = args.buyer_id as string;
  const buyerEmail = args.buyer_email as string;
  const accessLevel = (args.access_level as string) || 'teaser';

  // Look up contact_id from unified contacts table
  // Try matching by remarketing_buyer_id + is_primary_at_firm first, fall back to email match
  let contactId: string | null = null;
  const { data: primaryContact } = await (supabase as any)
    .from('contacts')
    .select('id')
    .eq('remarketing_buyer_id', buyerId)
    .eq('is_primary_at_firm', true)
    .eq('archived', false)
    .limit(1)
    .single();

  if (primaryContact) {
    contactId = primaryContact.id;
  } else if (buyerEmail) {
    // Fall back to email match
    const { data: emailContact } = await (supabase as any)
      .from('contacts')
      .select('id')
      .eq('email', buyerEmail)
      .eq('contact_type', 'buyer')
      .eq('archived', false)
      .limit(1)
      .single();
    if (emailContact) contactId = emailContact.id;
  }

  // Write to data_room_access (the authoritative table)
  const { data, error } = await (supabase as any)
    .from('data_room_access')
    .insert({
      deal_id: dealId,
      remarketing_buyer_id: buyerId,
      contact_id: contactId,
      can_view_teaser: true,
      can_view_full_memo: accessLevel === 'memo' || accessLevel === 'full',
      can_view_data_room: accessLevel === 'full',
      granted_by: userId,
      granted_at: new Date().toISOString(),
    })
    .select(
      'id, remarketing_buyer_id, contact_id, can_view_teaser, can_view_full_memo, can_view_data_room, granted_at',
    )
    .single();

  if (error) return { error: error.message };

  // Log activity — resolve actual deal from listing+buyer
  const { data: linkedDeal } = await (supabase as any)
    .from('deal_pipeline')
    .select('id')
    .eq('listing_id', dealId)
    .eq('remarketing_buyer_id', buyerId)
    .limit(1)
    .maybeSingle();

  if (linkedDeal) {
    await (supabase as any).from('deal_activities').insert({
      deal_id: linkedDeal.id,
      activity_type: 'data_room',
      title: `Data room access granted to ${args.buyer_name}`,
      description: `${accessLevel} access granted to ${args.buyer_name} (${buyerEmail})`,
      admin_id: userId,
      metadata: {
        source: 'ai_command_center',
        buyer_id: buyerId,
        contact_id: contactId,
        access_level: accessLevel,
      },
    });
  }

  return {
    data: {
      access: data,
      access_level: accessLevel,
      contact_id: contactId,
      message: `Data room access (${accessLevel}) granted to ${args.buyer_name}${contactId ? '' : ' (warning: no matching contact found in contacts table)'}`,
    },
  };
}

// ---------- reassign_deal_task ----------

async function reassignDealTask(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const taskId = args.task_id as string;
  if (!taskId) return { error: 'task_id is required' };

  let newAssigneeId = args.new_assignee_id as string | undefined;

  // Look up by email if ID not provided
  if (!newAssigneeId && args.new_assignee_email) {
    const { data: user } = await (supabase as any)
      .from('profiles')
      .select('id, full_name, email')
      .eq('email', args.new_assignee_email as string)
      .limit(1)
      .single();

    if (!user) return { error: `No user found with email: ${args.new_assignee_email}` };
    newAssigneeId = user.id;
  }

  if (!newAssigneeId) return { error: 'Either new_assignee_id or new_assignee_email is required' };

  // Get the task from unified table
  const { data: task, error: taskError } = await (supabase as any)
    .from('daily_standup_tasks')
    .select('id, title, entity_id, entity_type, assignee_id')
    .eq('id', taskId)
    .single();

  if (taskError || !task) return { error: `Task not found: ${taskId}` };

  // Get old assignee name
  let oldAssigneeName = 'unassigned';
  if (task.assignee_id) {
    const { data: oldUser } = await (supabase as any)
      .from('profiles')
      .select('full_name')
      .eq('id', task.assignee_id)
      .single();
    if (oldUser) oldAssigneeName = oldUser.full_name || 'Unknown';
  }

  // Get new assignee name
  const { data: newUser } = await (supabase as any)
    .from('profiles')
    .select('full_name, email')
    .eq('id', newAssigneeId)
    .single();
  const newAssigneeName = newUser?.full_name || newUser?.email || 'Unknown';

  // Update the task
  const { error: updateError } = await (supabase as any)
    .from('daily_standup_tasks')
    .update({
      assignee_id: newAssigneeId,
    })
    .eq('id', taskId);

  if (updateError) return { error: updateError.message };

  // Log activity if this is a deal task
  if (task.entity_type === 'deal' && task.entity_id) {
    await (supabase as any).from('deal_activities').insert({
      deal_id: task.entity_id,
      activity_type: 'task_reassigned',
      title: `Task reassigned: "${task.title}"`,
      description: `Reassigned from ${oldAssigneeName} to ${newAssigneeName}${args.reason ? `. Reason: ${args.reason}` : ''}`,
      admin_id: userId,
      metadata: {
        source: 'ai_command_center',
        task_id: taskId,
        old_assignee: task.assignee_id,
        new_assignee: newAssigneeId,
      },
    });
  }

  return {
    data: {
      task_id: taskId,
      task_title: task.title,
      old_assignee: oldAssigneeName,
      new_assignee: newAssigneeName,
      message: `Task "${task.title}" reassigned from ${oldAssigneeName} to ${newAssigneeName}`,
    },
  };
}

// ---------- convert_to_pipeline_deal ----------

async function convertToPipelineDeal(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const listingId = args.listing_id as string;
  const buyerId = args.buyer_id as string;
  const initialStage = (args.initial_stage as string) || 'contacted';

  if (!listingId || !buyerId) {
    return { error: 'listing_id and buyer_id are required' };
  }

  // Verify listing exists
  const { data: listing, error: listingError } = await (supabase as any)
    .from('listings')
    .select('id, title, internal_company_name, industry, revenue, ebitda')
    .eq('id', listingId)
    .single();

  if (listingError || !listing) return { error: `Listing not found: ${listingId}` };

  // Verify buyer exists
  const { data: buyer, error: buyerError } = await (supabase as any)
    .from('buyers')
    .select('id, company_name, pe_firm_name, buyer_type')
    .eq('id', buyerId)
    .single();

  if (buyerError || !buyer) return { error: `Buyer not found: ${buyerId}` };

  // Check if deal already exists for this buyer+listing combo
  const { data: existingDeal } = await (supabase as any)
    .from('deal_pipeline')
    .select('id')
    .eq('listing_id', listingId)
    .eq('buyer_id', buyerId)
    .limit(1)
    .maybeSingle();

  if (existingDeal) {
    return {
      error: `A deal already exists for ${buyer.company_name || buyer.pe_firm_name} on listing "${listing.title || listing.internal_company_name}" (deal ID: ${existingDeal.id})`,
    };
  }

  // Look up the stage
  const { data: stageRecord } = await (supabase as any)
    .from('deal_stages')
    .select('id, name')
    .ilike('name', initialStage)
    .limit(1)
    .single();

  // Create the deal
  const now = new Date().toISOString();
  const { data: deal, error: dealError } = await (supabase as any)
    .from('deal_pipeline')
    .insert({
      listing_id: listingId,
      remarketing_buyer_id: buyerId,
      title: `${buyer.company_name || buyer.pe_firm_name} - ${listing.title || listing.internal_company_name}`,
      stage_id: stageRecord?.id || null,
      source: 'remarketing',
      created_at: now,
      updated_at: now,
    })
    .select('id, title, stage_id')
    .single();

  if (dealError) return { error: `Failed to create deal: ${dealError.message}` };

  // Create firm agreement record if one doesn't exist
  const { data: existingAgreement } = await (supabase as any)
    .from('firm_agreements')
    .select('id')
    .eq('remarketing_buyer_id', buyerId)
    .limit(1)
    .maybeSingle();

  if (!existingAgreement) {
    await (supabase as any).from('firm_agreements').insert({
      remarketing_buyer_id: buyerId,
      primary_company_name: buyer.company_name || buyer.pe_firm_name,
      nda_signed: false,
      fee_agreement_signed: false,
      created_at: now,
    });
  }

  // Update remarketing_scores status to 'pipeline'
  await (supabase as any)
    .from('remarketing_scores')
    .update({ status: 'pipeline', updated_at: now })
    .eq('buyer_id', buyerId)
    .eq('listing_id', listingId);

  // Log activity
  await (supabase as any).from('deal_activities').insert({
    deal_id: deal.id,
    activity_type: 'deal_created',
    title: `Pipeline deal created: ${deal.title}`,
    description: `Converted from remarketing match. ${args.notes ? `Notes: ${args.notes}` : ''}`,
    admin_id: userId,
    metadata: {
      source: 'ai_command_center',
      listing_id: listingId,
      buyer_id: buyerId,
      initial_stage: stageRecord?.name || initialStage,
    },
  });

  return {
    data: {
      deal_id: deal.id,
      deal_title: deal.title,
      listing_id: listingId,
      buyer_id: buyerId,
      buyer_name: buyer.company_name || buyer.pe_firm_name,
      listing_title: listing.title || listing.internal_company_name,
      stage: stageRecord?.name || initialStage,
      message: `Pipeline deal created: "${deal.title}" at stage "${stageRecord?.name || initialStage}"`,
    },
  };
}
