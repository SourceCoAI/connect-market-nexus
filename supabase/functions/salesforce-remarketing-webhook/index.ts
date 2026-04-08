import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { errorResponse } from "../_shared/error-response.ts";

interface SalesforceAccount {
  Id: string;
  Name: string;
  Phone?: string;
  Website?: string;
  AnnualRevenue?: number;
  EBITDA__c?: number;
  BillingCity?: string;
  BillingState?: string;
  BillingCountry?: string;
  RecordTypeId?: string;
  Remarketing__c?: boolean;
  Remarketing_CB_Create_Date__c?: string;
  Remarketing_Reason__c?: string;
  Remarketing_Target_Stages__c?: string;
  Target_Stage__c?: string;
  Target_Sub_Stage__c?: string;
  Marketplace_Sub_Stage__c?: string;
  Interest_in_Selling__c?: string;
  Tier__c?: string;
  OwnerId?: string;
  Previous_Search__c?: string;
  Primary_Opportunity__c?: string;
  Primary_Client_Account__c?: string;
  Note_Summary__c?: string;
  Historic_Note_Summary__c?: string;
  remarketing_note__c?: string;
  LastModifiedDate?: string;
  CreatedDate?: string;
}

interface SalesforceContact {
  Id?: string;
  Email?: string;
  FirstName?: string;
  LastName?: string;
  Phone?: string;
  MobilePhone?: string;
  Title?: string;
}

interface SalesforceData {
  "Account Data"?: SalesforceAccount;
  "Contacts Data"?: SalesforceContact | SalesforceContact[];
}

interface WebhookPayload {
  salesforce_data?: SalesforceData;
  body?: { salesforce_data?: SalesforceData; "Account Data"?: SalesforceAccount };
  "Account Data"?: SalesforceAccount;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405, corsHeaders);
  }

  // Webhook secret verification
  const webhookSecret = Deno.env.get("SALESFORCE_WEBHOOK_SECRET");
  if (webhookSecret) {
    const providedSecret =
      req.headers.get("x-webhook-secret") ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (providedSecret !== webhookSecret) {
      console.error("Webhook secret mismatch");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } else {
    console.warn("SALESFORCE_WEBHOOK_SECRET not set — skipping webhook auth (set it to secure this endpoint)");
  }

  try {
    const raw: WebhookPayload | WebhookPayload[] = await req.json();

    // Log the top-level structure for debugging
    console.log("Received payload keys:", Array.isArray(raw) ? `array[${raw.length}]` : Object.keys(raw || {}));

    // Flexibly extract salesforce_data from multiple n8n payload shapes:
    // Shape 1: [{ body: { salesforce_data: {...} } }]        — n8n HTTP node array wrapper
    // Shape 2: { body: { salesforce_data: {...} } }           — n8n HTTP node single object
    // Shape 3: { salesforce_data: {...} }                     — direct payload
    // Shape 4: [{ salesforce_data: {...} }]                   — array without body wrapper
    // Shape 5: { "Account Data": {...}, "Contacts Data": ... } — raw SF data directly
    function extractSalesforceData(payload: WebhookPayload | WebhookPayload[] | null): SalesforceData | null {
      if (!payload) return null;

      // If it's an array, try the first element
      if (Array.isArray(payload)) {
        if (payload.length === 0) return null;
        return extractSalesforceData(payload[0]);
      }

      if (payload.salesforce_data) return payload.salesforce_data;

      if (payload.body?.salesforce_data) return payload.body.salesforce_data;

      if (payload["Account Data"]) return payload as unknown as SalesforceData;

      if (payload.body?.["Account Data"]) return payload.body as unknown as SalesforceData;

      return null;
    }

    const salesforceData = extractSalesforceData(raw);
    if (!salesforceData) {
      console.error("Could not extract salesforce_data from payload. Top-level:", JSON.stringify(raw).slice(0, 500));
      return errorResponse("Missing salesforce_data in payload. Accepted shapes: {salesforce_data:{...}}, [{body:{salesforce_data:{...}}}], or {\"Account Data\":{...}}", 400, corsHeaders);
    }
    console.log("Extracted salesforce_data keys:", Object.keys(salesforceData));

    const account = salesforceData["Account Data"] as SalesforceAccount | undefined;
    if (!account?.Id || !account?.Name) {
      return errorResponse("Missing required Account.Id or Account.Name", 400, corsHeaders);
    }

    const rawContacts = salesforceData["Contacts Data"];
    let contacts: SalesforceContact[] = [];
    if (Array.isArray(rawContacts)) {
      contacts = rawContacts;
    } else if (rawContacts && typeof rawContacts === "object" && (rawContacts as SalesforceContact).Id) {
      contacts = [rawContacts as SalesforceContact];
    }

    const primaryContact = contacts.find((c: SalesforceContact) => c.Email && c.Email.trim());
    const accountPhone = account.Phone || null;

    const resolvePhone = (contact: SalesforceContact | undefined): string | null =>
      contact?.Phone || contact?.MobilePhone || accountPhone;

    // Normalize website
    let website = account.Website || "";
    if (website && !/^https?:\/\//i.test(website)) {
      website = `https://${website}`;
    }

    // Build listing payload
    const listingPayload: Record<string, unknown> = {
      salesforce_account_id: account.Id,
      title: account.Name,
      internal_company_name: account.Name,
      revenue: account.AnnualRevenue ?? null,
      ebitda: account.EBITDA__c ?? null,
      website,
      address_city: account.BillingCity || null,
      address_state: account.BillingState || null,
      address_country: account.BillingCountry || null,
      deal_source: "salesforce_remarketing",
      is_internal_deal: true,
      status: "active",
      remarketing_status: "active",
      // SF-specific columns
      sf_record_type_id: account.RecordTypeId || null,
      sf_remarketing: account.Remarketing__c ?? false,
      sf_remarketing_cb_create_date: account.Remarketing_CB_Create_Date__c || null,
      sf_remarketing_reason: account.Remarketing_Reason__c || null,
      sf_remarketing_target_stages: account.Remarketing_Target_Stages__c || null,
      sf_target_stage: account.Target_Stage__c || null,
      sf_target_sub_stage: account.Target_Sub_Stage__c || null,
      sf_marketplace_sub_stage: account.Marketplace_Sub_Stage__c || null,
      sf_interest_in_selling: account.Interest_in_Selling__c || null,
      sf_tier: account.Tier__c || null,
      sf_owner_id: account.OwnerId || null,
      sf_previous_search_opportunity_id: account.Previous_Search__c || null,
      sf_primary_opportunity_id: account.Primary_Opportunity__c || null,
      sf_primary_client_account_id: account.Primary_Client_Account__c || null,
      sf_note_summary: account.Note_Summary__c || null,
      sf_historic_note_summary: account.Historic_Note_Summary__c || null,
      sf_remarks_internal: account.remarketing_note__c || null,
      sf_last_modified_date: account.LastModifiedDate || null,
      sf_created_date: account.CreatedDate || null,
    };

    // Set primary contact fields on listing from first contact with email
    if (primaryContact) {
      const firstName = primaryContact.FirstName || "";
      const lastName = primaryContact.LastName || "";
      listingPayload.main_contact_name = `${firstName} ${lastName}`.trim() || null;
      listingPayload.main_contact_email = primaryContact.Email;
      listingPayload.main_contact_phone = resolvePhone(primaryContact);
      listingPayload.main_contact_title = primaryContact.Title || null;
    } else {
      // Fallback phone from account
      listingPayload.main_contact_phone = accountPhone;
    }

    // Supabase admin client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Check if listing exists by salesforce_account_id
    const { data: existingListing } = await supabase
      .from("listings")
      .select("id")
      .eq("salesforce_account_id", account.Id)
      .maybeSingle();

    let listingId: string;

    if (existingListing) {
      // Update existing listing
      const { error: updateError } = await supabase
        .from("listings")
        .update(listingPayload)
        .eq("id", existingListing.id);
      if (updateError) {
        console.error("Listing update error:", updateError);
        return errorResponse(`Listing update failed: ${updateError.message}`, 500, corsHeaders);
      }
      listingId = existingListing.id;
    } else {
      // Insert new listing
      const { data: newListing, error: insertError } = await supabase
        .from("listings")
        .insert(listingPayload)
        .select("id")
        .single();
      if (insertError) {
        console.error("Listing insert error:", insertError);
        return errorResponse(`Listing insert failed: ${insertError.message}`, 500, corsHeaders);
      }
      listingId = newListing.id;
    }

    // Upsert contacts (unique index is on lower(email), listing_id WHERE contact_type='seller' AND archived=false)
    let contactsUpserted = 0;
    for (let i = 0; i < contacts.length; i++) {
      const contact: SalesforceContact = contacts[i];
      const email = contact.Email?.trim()?.toLowerCase();
      if (!email) continue;

      const isPrimary = i === contacts.indexOf(primaryContact);
      const firstName = contact.FirstName || "";
      const lastName = contact.LastName || "";
      const phone = resolvePhone(contact);
      const title = contact.Title || null;

      // Check if contact already exists
      const { data: existing } = await supabase
        .from("contacts")
        .select("id")
        .eq("listing_id", listingId)
        .eq("contact_type", "seller")
        .eq("archived", false)
        .ilike("email", email)
        .maybeSingle();

      if (existing) {
        const { error: updateErr } = await supabase
          .from("contacts")
          .update({
            first_name: firstName || null,
            last_name: lastName || null,
            phone,
            title,
            is_primary_seller_contact: isPrimary,
            source: "salesforce",
          })
          .eq("id", existing.id);
        if (updateErr) {
          console.error(`Contact update error for ${email}:`, updateErr);
        } else {
          contactsUpserted++;
        }
      } else {
        const { error: insertErr } = await supabase
          .from("contacts")
          .insert({
            listing_id: listingId,
            email,
            first_name: firstName || null,
            last_name: lastName || null,
            phone,
            title,
            contact_type: "seller",
            is_primary_seller_contact: isPrimary,
            source: "salesforce",
            archived: false,
          });
        if (insertErr) {
          console.error(`Contact insert error for ${email}:`, insertErr);
        } else {
          contactsUpserted++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        salesforce_account_id: account.Id,
        listing_id: listingId,
        contacts_upserted: contactsUpserted,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("salesforce-remarketing-webhook error:", err);
    return errorResponse(err instanceof Error ? err.message : "Internal server error", 500, corsHeaders);
  }
});
