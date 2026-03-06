import { format } from "date-fns";
import type { ValuationLead } from "./types";

// ─── Constants ───

export const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "aol.com", "outlook.com",
  "proton.me", "icloud.com", "live.com", "yahoo.com.au", "hotmail.se",
  "bellsouth.net", "mac.com", "webxio.pro", "leabro.com", "coursora.com",
  "mail.com", "zoho.com", "yandex.com", "protonmail.com",
]);

export const TLD_REGEX = /\.(com|net|org|io|co|ai|us|uk|ca|au|nz|ae|za|se|nl|br|fj|in|de|fr|es|it|jp|kr|mx|school|pro|app|dev|vc)(\.[a-z]{2})?$/i;

// ─── Word segmentation for concatenated domain names ───
export const WORD_DICT = new Set([
  // Business suffixes
  "inc", "llc", "ltd", "corp", "co", "group", "global", "usa", "us",
  // Common business words
  "the", "and", "pro", "plus", "max", "tech", "solutions", "services",
  // Engineering & trades
  "engineer", "engineering", "engineers", "fluid", "mechanical", "electrical",
  "civil", "structural", "industrial", "chemical", "aerospace", "systems",
  "design", "designs", "designer", "designers", "build", "builds", "builder",
  "builders", "construct", "construction", "fabrication", "fabricate",
  "automation", "automate", "automated", "controls", "control", "precision",
  "technical", "technologies", "technology", "innovations", "innovation",
  "innovative", "creative", "creations", "creation", "develop", "development",
  "developers", "developer",
  "management", "consulting", "roofing", "plumbing",
  "electric", "heating", "cooling", "hvac",
  "air", "auto", "automotive", "car", "cars", "motor", "motors",
  "mountain", "top", "iron", "horse", "brass", "works", "steel",
  "gold", "silver", "blue", "green", "red", "black", "white",
  "north", "south", "east", "west", "central", "pacific", "atlantic",
  "american", "national", "premier", "elite", "prime", "first", "best",
  "all", "star", "sun", "moon", "sky", "bay", "lake", "river", "rock",
  "stone", "wood", "fire", "water", "rain", "tree", "oak", "pine", "elm",
  "capital", "venture", "equity", "asset", "wealth", "financial", "finance",
  "invest", "investment", "investments", "fund", "funding", "partners",
  "partner", "advisory", "advisors", "advisor", "strategy", "strategic",
  "home", "homes", "house", "land", "lands", "property", "properties",
  "real", "estate", "building",
  "digital", "media", "web", "net", "online",
  "cloud", "data", "soft", "ware", "software", "system",
  "health", "care", "healthcare", "medical", "dental", "wellness",
  "food", "foods", "fresh", "organic", "natural", "clean", "pure",
  "energy", "power", "solar", "wind", "bright", "light",
  "safe", "safety", "guard", "security", "shield", "protect",
  "fast", "quick", "speed", "rapid", "express", "direct",
  "smart", "wise", "logic", "genius", "mind", "brain",
  "city", "town", "urban", "metro", "rural", "village",
  "new", "next", "future", "modern", "classic", "legacy",
  "king", "crown", "royal", "regal", "noble",
  "aquatic", "aquatics", "marine", "ocean", "sea", "coast", "coastal",
  "tropical", "collision", "body", "shop", "repair", "fix",
  "project", "foundry", "forge", "craft", "made", "custom",
  "nursery", "garden", "gardens", "lawn", "landscape", "landscaping",
  "paint", "painting", "color", "colours", "colors",
  "supply", "supplies", "source", "store", "market", "trading",
  "transport", "transportation", "freight", "logistics", "fleet",
  "print", "printing", "sign", "signs", "signage",
  "event", "events", "party", "catering", "venue",
  "sport", "sports", "fit", "fitness", "gym", "athletic",
  "pet", "pets", "vet", "veterinary", "animal", "animals",
  "spa", "salon", "beauty", "hair", "skin", "nail", "nails",
  "bar", "grill", "cafe", "coffee", "tea", "brew", "brewing",
  "farm", "farms", "ranch", "harvest", "crop", "grain",
  "school", "academy", "learning", "education", "training",
  "law", "legal", "justice", "court",
  "ortho", "vision", "eye", "eyes", "optical",
  "bon", "terra", "vita", "sol", "luna", "alta", "bella",
  "com", "compost", "vermont", "carolina", "texas", "florida",
  "boyland", "raintree",
  // Additional words for better segmentation
  "willow", "watts", "vault", "box", "clinic", "valens",
  "provider", "accreditation", "senior", "bend", "gilbert",
  "comfort", "merit", "service", "dino", "dinos",
  "glass", "line", "horizon", "fox", "hunt", "wolf", "byte",
  "clear", "pay", "gain", "gainz", "loft", "wisconsin",
  "cupola", "barn", "trace",
  "mon", "lion", "money", "coin", "gecko",
  "hub", "bubble", "price", "hoppah", "stax",
  "tesloid", "ropella", "scorpa",
  "bee", "hive", "bear", "eagle", "hawk", "falcon",
  "apex", "summit", "peak", "crest", "ridge",
  "haven", "harbor", "harbour", "port", "gate", "way",
  "link", "bridge", "path", "trail", "road",
  "tower", "point", "view", "scape",
  "micro", "macro", "mega", "nano", "multi",
  "rest", "restore", "restoration", "restorations",
  "test", "testing", "audit", "compliance",
  "pass", "flash", "dash", "rush",
  "ace", "alpha", "beta", "omega", "delta", "sigma",
  "key", "lock", "code", "cipher",
  "pilot", "captain", "chief", "lead", "guide",
  "true", "trust", "loyal", "honor",
  // Common words that were causing segmentation failures
  "bros", "bro", "brother", "brothers",
  "pros", "my", "your", "our", "his", "her", "its", "we",
  "mechanic", "mechanics",
  "hand", "guy", "guys", "man", "men",
  "tax", "cab", "van", "fly", "run", "bit", "log",
  "pop", "hot", "big", "old",
  // Additional brand/domain words found in practice
  "sims", "funerals", "funeral", "bespoke", "kreative", "kreate",
  "kayes", "ksd", "mvp", "polka", "audio", "gainz",
  "legacy", "sanmora", "masource",
  "kayesk", "tbs", "senior", "gilbert", "comfort",
  "merit", "dino", "glass", "horizon", "vault", "provider",
  "reative", "morabespoke",
  // Additional words to improve segmentation accuracy
  "legend", "voi", "gk", "gkrestoration",
  "musitechnic", "technic", "technica", "technics",
  "hoppah", "clearpay", "globall", "bilingual",
  "restorations",
]);

/** Segment a concatenated string into words using dictionary-based dynamic programming. */
export function segmentWords(input: string): string {
  const s = input.toLowerCase();
  const n = s.length;
  // Short strings (<=4 chars): treat as acronym -> uppercase
  if (n <= 4) return input.toUpperCase();

  // dp[i] = best segmentation for s[0..i-1], scored by minimizing number of non-dict chunks
  const dp: { cost: number; words: string[] }[] = new Array(n + 1);
  dp[0] = { cost: 0, words: [] };

  for (let i = 1; i <= n; i++) {
    // Default: take single character (worst case)
    dp[i] = { cost: dp[i - 1].cost + 1, words: [...dp[i - 1].words, s[i - 1]] };

    for (let j = 0; j < i; j++) {
      const substr = s.slice(j, i);
      const isWord = WORD_DICT.has(substr);
      const cost = dp[j].cost + (isWord ? 0 : (substr.length <= 2 ? 2 : 1));

      // Prefer lower cost; on tie, prefer MORE words (more splits = more dict matches)
      if (cost < dp[i].cost || (cost === dp[i].cost && dp[j].words.length + 1 > dp[i].words.length)) {
        dp[i] = { cost, words: [...dp[j].words, substr] };
      }
    }
  }

  // Capitalize: dict words -> Title Case, non-dict short (<=4) -> UPPERCASE, non-dict long -> Title Case
  return dp[n].words.map(w => {
    if (WORD_DICT.has(w)) return w.charAt(0).toUpperCase() + w.slice(1);
    if (w.length <= 4) return w.toUpperCase();
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(" ");
}

/** Format a date string as a relative age: "4d ago", "2mo ago", "1y ago" */
export function formatAge(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "1d ago";
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30.44);
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  const diffYears = Math.floor(diffMonths / 12);
  return `${diffYears}y ago`;
}

export function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Clean a full_name username into a human-readable display string. */
export function cleanFullName(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.trim()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!/[a-zA-Z]/.test(cleaned)) return null;
  if (!cleaned.includes(" ")) {
    if (/\d/.test(cleaned)) return null;
    if (cleaned.length < 3) return null;
  }
  const words = cleaned.split(" ").filter(w => /^[a-zA-Z]{2,}$/.test(w));
  if (words.length === 0) return null;
  return toTitleCase(cleaned);
}

export function cleanWebsiteToDomain(raw: string | null): string | null {
  if (!raw || !raw.trim()) return null;
  const v = raw.trim();
  if (v.includes("@")) return null;
  const noProto = v.replace(/^[a-z]{2,8}:\/\//i, "").replace(/^[a-z]{2,8}:/i, "");
  const noWww = noProto.replace(/^www\./i, "");
  const domain = noWww.split("/")[0].split("?")[0].split("#")[0];
  if (!domain || !domain.includes(".")) return null;
  if (/[,\s]/.test(domain)) return null;
  if (/^(test|no|example)\./i.test(domain)) return null;
  return domain.toLowerCase();
}

export function isPlaceholderBusinessName(name: string): boolean {
  const lower = name.toLowerCase().trim();
  if (/[''\u2019\u02BC\u0060]s business$/i.test(lower)) return true;
  if (/^www\b/i.test(lower)) return true;
  if (/\.(com|net|org|io|co|ai|us|uk|ca|au|nz|school|pro|app|dev)(\s|$)/i.test(lower)) return true;
  if (/^[a-z0-9_]+$/i.test(lower) && lower.includes("_")) return true;
  if (/^[a-z0-9]+\d+[a-z0-9]*$/i.test(lower) && !/\s/.test(lower)) return true;
  return false;
}

export function extractBusinessName(lead: ValuationLead): string {
  if (lead.business_name && !isPlaceholderBusinessName(lead.business_name)) {
    const bn = lead.business_name.trim();
    const fixed = bn.replace(/\u00e2\u20ac\u2122/g, "'").replace(/'([A-Z])/g, (_, c) => `'${c.toLowerCase()}`);
    if (/\s/.test(fixed)) return fixed;
    const segmented = segmentWords(fixed.toLowerCase());
    if (segmented.includes(" ")) return segmented;
    return fixed;
  }
  const domain = cleanWebsiteToDomain(lead.website);
  if (domain) {
    const cleaned = domain.replace(TLD_REGEX, "");
    if (cleaned && !cleaned.match(/^(test|no|example)$/i)) {
      if (/^[a-z0-9]+$/i.test(cleaned) && /\d/.test(cleaned)) {
        // fall through to email/name fallback
      } else if (/[-_.]/.test(cleaned)) {
        return toTitleCase(cleaned.replace(/[-_.]/g, " "));
      } else {
        return segmentWords(cleaned);
      }
    }
  }
  if (lead.email) {
    const emailDomain = lead.email.split("@")[1]?.toLowerCase();
    if (emailDomain && !GENERIC_EMAIL_DOMAINS.has(emailDomain)) {
      const name = emailDomain
        .split(".")[0]
        .replace(/[0-9]+$/, "")
        .replace(/[-_]/g, " ");
      if (name) {
        if (!/\s/.test(name)) {
          return segmentWords(name);
        }
        return toTitleCase(name);
      }
    }
  }
  const humanName = cleanFullName(lead.full_name);
  if (humanName) return humanName;
  return lead.display_name || "\u2014";
}

export function inferWebsite(lead: ValuationLead): string | null {
  const domain = cleanWebsiteToDomain(lead.website);
  if (domain) return domain;
  if (lead.email) {
    const emailDomain = lead.email.split("@")[1]?.toLowerCase();
    if (emailDomain && !GENERIC_EMAIL_DOMAINS.has(emailDomain)) {
      return emailDomain;
    }
  }
  return null;
}

export const QUALITY_ORDER: Record<string, number> = {
  "Very Strong": 4,
  "Solid": 3,
  "Average": 2,
  "Needs Work": 1,
};

/** Build a full listing insert object from a valuation lead */
export function buildListingFromLead(lead: ValuationLead, forPush = true) {
  const businessName = extractBusinessName(lead);
  const cleanDomain = inferWebsite(lead);
  const title = businessName !== "\u2014" ? businessName : lead.full_name || "Valuation Lead";

  const motivationParts: string[] = [];
  if (lead.exit_timing === "now") motivationParts.push("Looking to exit now");
  else if (lead.exit_timing === "1-2years") motivationParts.push("Exit in 1-2 years");
  else if (lead.exit_timing === "exploring") motivationParts.push("Exploring options");
  if (lead.open_to_intros) motivationParts.push("Open to buyer introductions");

  const calcTypeLabel = lead.calculator_type === "auto_shop" ? "Auto Shop" : lead.calculator_type === "general" ? "General" : lead.calculator_type;

  const noteLines: string[] = [
    `--- Valuation Calculator Lead Intelligence ---`,
    `Source: ${calcTypeLabel} Calculator`,
    `Submitted: ${new Date(lead.created_at).toLocaleDateString()}`,
  ];

  if (lead.full_name) noteLines.push(`Name: ${lead.full_name}`);
  if (lead.email) noteLines.push(`Email: ${lead.email}`);
  if (lead.phone) noteLines.push(`Phone: ${lead.phone}`);
  if (lead.linkedin_url) noteLines.push(`LinkedIn: ${lead.linkedin_url}`);
  if (lead.business_name) noteLines.push(`Business Name: ${lead.business_name}`);
  if (lead.website) noteLines.push(`Website: ${lead.website}`);
  if (lead.industry) noteLines.push(`Industry: ${lead.industry}`);
  if (lead.location) noteLines.push(`Location: ${lead.location}`);
  if (lead.locations_count != null) noteLines.push(`Number of Locations: ${lead.locations_count}`);
  if (lead.revenue_model) noteLines.push(`Revenue Model: ${lead.revenue_model}`);
  if (lead.growth_trend) noteLines.push(`Growth Trend: ${lead.growth_trend}`);
  if (lead.revenue != null) noteLines.push(`Revenue: $${(lead.revenue / 1e6).toFixed(2)}M`);
  if (lead.ebitda != null) noteLines.push(`EBITDA: $${lead.ebitda < 1000 ? `${lead.ebitda}K` : `${(lead.ebitda / 1e6).toFixed(2)}M`}`);
  if (lead.valuation_low != null && lead.valuation_high != null) {
    noteLines.push(`Self-Assessed Valuation: $${(lead.valuation_low / 1e6).toFixed(1)}M \u2013 $${(lead.valuation_high / 1e6).toFixed(1)}M (mid: $${((lead.valuation_mid || 0) / 1e6).toFixed(1)}M)`);
  }
  if (lead.lead_score != null) noteLines.push(`Lead Score: ${lead.lead_score}/100`);
  if (lead.quality_label) noteLines.push(`Quality: ${lead.quality_label} (tier: ${lead.quality_tier || "\u2014"})`);
  if (lead.readiness_score != null) noteLines.push(`Readiness: ${lead.readiness_score}/100`);
  if (lead.exit_timing) noteLines.push(`Exit Timing: ${lead.exit_timing}`);
  if (lead.open_to_intros != null) noteLines.push(`Open to Intros: ${lead.open_to_intros ? "Yes" : "No"}`);
  if (lead.owner_dependency) noteLines.push(`Owner Dependency: ${lead.owner_dependency}`);
  if (lead.buyer_lane) noteLines.push(`Buyer Lane: ${lead.buyer_lane}`);
  if (lead.cta_clicked != null) noteLines.push(`CTA Clicked: ${lead.cta_clicked ? "Yes" : "No"}`);
  if (lead.scoring_notes) noteLines.push(`Scoring Notes: ${lead.scoring_notes}`);

  if (lead.raw_calculator_inputs && Object.keys(lead.raw_calculator_inputs).length > 0) {
    noteLines.push(`\n--- Raw Calculator Inputs ---`);
    for (const [key, val] of Object.entries(lead.raw_calculator_inputs)) {
      if (val != null && val !== "") {
        const label = key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        noteLines.push(`${label}: ${val}`);
      }
    }
  }

  if (lead.raw_valuation_results && Object.keys(lead.raw_valuation_results).length > 0) {
    noteLines.push(`\n--- Valuation Results ---`);
    for (const [key, val] of Object.entries(lead.raw_valuation_results)) {
      if (val != null && val !== "") {
        const label = key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        noteLines.push(`${label}: ${val}`);
      }
    }
  }

  if (lead.calculator_specific_data && Object.keys(lead.calculator_specific_data).length > 0) {
    noteLines.push(`\n--- Calculator Specific Data ---`);
    for (const [key, val] of Object.entries(lead.calculator_specific_data)) {
      if (val != null && val !== "") {
        const label = key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        noteLines.push(`${label}: ${val}`);
      }
    }
  }

  const locationParts = lead.location?.split(",").map(s => s.trim());
  const address_city = locationParts?.[0] || null;
  const address_state = locationParts?.[1]?.length === 2 ? locationParts[1] : null;

  return {
    title,
    internal_company_name: title,
    deal_source: "valuation_calculator",
    deal_identifier: `vlead_${lead.id.slice(0, 8)}`,
    status: "active",
    is_internal_deal: true,
    pushed_to_all_deals: forPush,
    ...(forPush ? { pushed_to_all_deals_at: new Date().toISOString() } : {}),
    main_contact_name: lead.full_name || null,
    main_contact_email: lead.email || null,
    main_contact_phone: lead.phone || null,
    website: cleanDomain ? `https://${cleanDomain}` : null,
    linkedin_url: lead.linkedin_url || null,
    industry: lead.industry || null,
    location: lead.location || null,
    address_city,
    address_state,
    revenue: lead.revenue,
    ebitda: lead.ebitda,
    revenue_model: lead.revenue_model || null,
    growth_trajectory: lead.growth_trend || null,
    number_of_locations: lead.locations_count || null,
    seller_motivation: motivationParts.join(". ") || null,
    owner_goals: lead.exit_timing ? `Exit timing: ${lead.exit_timing}${lead.open_to_intros ? ". Open to buyer introductions." : ""}` : null,
    internal_notes: noteLines.join("\n"),
    deal_owner_id: lead.deal_owner_id || null,
  } as never;
}

export function exportLeadsToCSV(leads: ValuationLead[]) {
  const headers = [
    "Business Name", "Contact Name", "Email", "Phone", "Website",
    "Industry", "Location", "Revenue", "EBITDA",
    "Valuation Low", "Valuation Mid", "Valuation High",
    "Lead Score", "Quality", "Exit Timing", "Open to Intros",
    "Calculator Type", "Status", "Pushed", "Pushed At", "Created At",
  ];
  const rows = leads.map(l => [
    extractBusinessName(l),
    l.full_name || "",
    l.email || "",
    l.phone || "",
    inferWebsite(l) || "",
    l.industry || "",
    l.location || "",
    l.revenue ?? "",
    l.ebitda ?? "",
    l.valuation_low ?? "",
    l.valuation_mid ?? "",
    l.valuation_high ?? "",
    l.lead_score ?? "",
    l.quality_label || "",
    l.exit_timing || "",
    l.open_to_intros != null ? (l.open_to_intros ? "Yes" : "No") : "",
    l.calculator_type,
    l.status || "",
    l.pushed_to_all_deals ? "Yes" : "No",
    l.pushed_to_all_deals_at ? format(new Date(l.pushed_to_all_deals_at), "yyyy-MM-dd") : "",
    format(new Date(l.created_at), "yyyy-MM-dd"),
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `valuation-leads-${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
