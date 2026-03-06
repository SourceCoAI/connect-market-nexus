/**
 * Advanced utility functions for parsing financial data and business insights from descriptions
 */

export interface ExtractedFinancials {
  revenue?: {
    value: number;
    display: string;
    confidence: number;
  };
  ebitda?: {
    value: number;
    display: string;
    confidence: number;
  };
  margin?: {
    value: number;
    display: string;
    confidence: number;
  };
  revenueModel?: string;
  growthDrivers?: string[];
  competitiveAdvantages?: string[];
  marketTrends?: string[];
  riskFactors?: string[];
  customerBase?: string;
  technology?: string[];
  keyMetrics?: { [key: string]: string };
}

export interface RiskAssessment {
  level: 'Low' | 'Low-Medium' | 'Medium' | 'Medium-High' | 'High';
  factors: string[];
  industryRisks: string[];
  mitigationFactors: string[];
  confidence: number;
}

export interface CustomInvestmentThesis {
  overview: string;
  keyStrengths: string[];
  growthOpportunity: string;
  marketPosition: string;
  competitiveAdvantages: string[];
  investmentHighlights: string[];
  riskAssessment: RiskAssessment;
  confidence: number;
}

// Standardized geographic regions
export const STANDARDIZED_LOCATIONS = [
  'North America',
  'United States',
  'Canada',
  'Northeast US', 
  'Southeast US',
  'Midwest US',
  'Southwest US',
  'Western US',
  'Europe',
  'United Kingdom', 
  'Asia Pacific',
  'Global/International'
] as const;

export type StandardizedLocation = typeof STANDARDIZED_LOCATIONS[number];

// Standardized business categories
export const STANDARDIZED_CATEGORIES = [
  'Technology & Software',
  'Healthcare & Medical',
  'Finance & Insurance',
  'Manufacturing',
  'Retail & E-commerce',
  'Real Estate',
  'Food & Beverage',
  'Professional Services',
  'Construction',
  'Transportation & Logistics',
  'Energy & Utilities',
  'Education',
  'Entertainment & Media',
  'Agriculture & Farming',
  'Automotive',
  'Telecommunications',
  'Aerospace & Defense',
  'Chemicals',
  'Consumer Goods',
  'Infrastructure',
  'Mining & Natural Resources',
  'Hospitality & Tourism',
  'Government Services',
  'Non-Profit',
  'Biotechnology',
  'Environmental Services',
  'Consulting',
  'Marketing & Advertising',
  'Legal Services',
  'Architecture & Engineering',
  'Security Services',
  'Waste Management',
  'Fitness & Wellness',
  'Beauty & Personal Care',
  'Textiles & Apparel',
  'Pharmaceuticals',
  'Publishing & Media',
  'Gaming & Entertainment',
  'Pet Services',
  'Home Services',
  'Import/Export',
  'Industrial Equipment',
  'Marine & Maritime',
  'Aviation',
  'Other'
] as const;

export type StandardizedCategory = typeof STANDARDIZED_CATEGORIES[number];

// formatCurrency is now centralized in currency-utils.ts — use that instead
// Kept as re-export for any external callers during migration
export { formatCurrency } from './currency-utils';

export interface InvestmentThesis {
  overview: string;
  keyStrengths: string[];
  growthOpportunity: string;
  marketPosition: string;
}

// Industry proximity mapping for smart matching
const INDUSTRY_PROXIMITY_MAP: Record<string, string[]> = {
  'Technology & Software': ['Telecommunications', 'Biotechnology', 'Gaming & Entertainment'],
  'Manufacturing': ['Automotive', 'Industrial Equipment', 'Chemicals', 'Aerospace & Defense'],
  'Healthcare & Medical': ['Pharmaceuticals', 'Biotechnology', 'Fitness & Wellness'],
  'Finance & Insurance': ['Professional Services', 'Legal Services', 'Consulting'],
  'Real Estate': ['Construction', 'Architecture & Engineering', 'Home Services'],
  'Energy & Utilities': ['Environmental Services', 'Mining & Natural Resources', 'Infrastructure'],
  'Food & Beverage': ['Agriculture & Farming', 'Hospitality & Tourism', 'Retail & E-commerce'],
  'Transportation & Logistics': ['Automotive', 'Aviation', 'Marine & Maritime'],
  'Professional Services': ['Consulting', 'Legal Services', 'Marketing & Advertising'],
  'Entertainment & Media': ['Gaming & Entertainment', 'Publishing & Media', 'Marketing & Advertising']
};

export function calculateIndustryMatchScore(userCategories: string[], listingCategory: string): number {
  if (!userCategories.length || !listingCategory) return 0;
  
  // Handle 'All Industries' option
  if (userCategories.includes('All Industries')) {
    return 100;
  }
  
  // Direct exact match
  if (userCategories.includes(listingCategory)) {
    return 100;
  }
  
  // Check for industry proximity/similarity
  for (const userCategory of userCategories) {
    const proximateIndustries = INDUSTRY_PROXIMITY_MAP[userCategory] || [];
    if (proximateIndustries.includes(listingCategory)) {
      return 80; // High similarity
    }
    
    // Check reverse mapping
    const reverseMatch = INDUSTRY_PROXIMITY_MAP[listingCategory] || [];
    if (reverseMatch.includes(userCategory)) {
      return 80; // High similarity
    }
  }
  
  // Broader category matching (e.g., "Technology" matches "Technology & Software")
  for (const userCategory of userCategories) {
    if (userCategory.toLowerCase().includes(listingCategory.toLowerCase()) ||
        listingCategory.toLowerCase().includes(userCategory.toLowerCase())) {
      return 70; // Good partial match
    }
  }
  
  return 0; // No match
}

/**
 * Extract comprehensive financial metrics and business insights from description text
 */
export function extractFinancialMetrics(description: string): ExtractedFinancials {
  const metrics: ExtractedFinancials = {};
  const lowerDesc = description.toLowerCase();
  
  // Enhanced revenue extraction patterns
  const revenuePatterns = [
    /\$(\d+(?:\.\d+)?)\s*M\+?\s*(?:annual\s+)?revenue/i,
    /(?:annual\s+)?revenue.*?\$(\d+(?:\.\d+)?)\s*M/i,
    /(\d+(?:\.\d+)?)\s*million.*(?:annual\s+)?revenue/i,
    /generates.*?\$(\d+(?:\.\d+)?)\s*M/i,
  ];
  
  for (const pattern of revenuePatterns) {
    const match = description.match(pattern);
    if (match) {
      const value = parseFloat(match[1]) * 1000000;
      metrics.revenue = {
        value,
        display: `$${match[1]}M`,
        confidence: 0.9
      };
      break;
    }
  }
  
  // Enhanced EBITDA extraction patterns
  const ebitdaPatterns = [
    /\$(\d+(?:\.\d+)?)\s*M\+?\s*EBITDA/i,
    /EBITDA.*?\$(\d+(?:\.\d+)?)\s*M/i,
    /(\d+(?:\.\d+)?)\s*million.*EBITDA/i,
    /operating profit.*?\$(\d+(?:\.\d+)?)\s*M/i,
  ];
  
  for (const pattern of ebitdaPatterns) {
    const match = description.match(pattern);
    if (match) {
      const value = parseFloat(match[1]) * 1000000;
      metrics.ebitda = {
        value,
        display: `$${match[1]}M`,
        confidence: 0.9
      };
      break;
    }
  }
  
  // Enhanced margin extraction
  const marginPatterns = [
    /(\d+(?:\.\d+)?)%\s*(?:gross\s+|net\s+|EBITDA\s+)?margin/i,
    /margin.*?(\d+(?:\.\d+)?)%/i,
    /profitability.*?(\d+(?:\.\d+)?)%/i,
  ];
  
  for (const pattern of marginPatterns) {
    const match = description.match(pattern);
    if (match) {
      const value = parseFloat(match[1]);
      metrics.margin = {
        value,
        display: `${value}%`,
        confidence: 0.8
      };
      break;
    }
  }
  
  // Revenue model analysis
  const revenueModels = [
    { pattern: /recurring|subscription|saas|monthly|annual contract/i, model: 'Recurring Revenue Model' },
    { pattern: /project[\s-]based|contract|consulting|services/i, model: 'Project-Based Revenue' },
    { pattern: /retail|e[\s-]?commerce|sales|transaction/i, model: 'Transactional Revenue' },
    { pattern: /licensing|royalty|franchise/i, model: 'Licensing Revenue' },
  ];
  
  for (const { pattern, model } of revenueModels) {
    if (pattern.test(description)) {
      metrics.revenueModel = model;
      break;
    }
  }
  
  
  // Competitive advantages
  const advantageKeywords = [
    'first mover', 'barriers to entry', 'economies of scale', 'network effects',
    'switching costs', 'regulatory moat', 'brand loyalty', 'cost leadership',
    'differentiation', 'innovation', 'exclusive agreements'
  ];
  metrics.competitiveAdvantages = advantageKeywords.filter(keyword => 
    lowerDesc.includes(keyword.toLowerCase())
  );
  
  // Market trends
  const trendKeywords = [
    'growing demand', 'market growth', 'demographic trends', 'digitization',
    'sustainability', 'automation trend', 'consolidation', 'regulatory tailwinds'
  ];
  metrics.marketTrends = trendKeywords.filter(keyword => 
    lowerDesc.includes(keyword.toLowerCase())
  );
  
  // Risk factors
  const riskKeywords = [
    'competition', 'regulatory risk', 'customer concentration', 'cyclical',
    'technology disruption', 'economic sensitivity', 'key person risk'
  ];
  metrics.riskFactors = riskKeywords.filter(keyword => 
    lowerDesc.includes(keyword.toLowerCase())
  );
  
  // Customer base analysis
  if (lowerDesc.includes('diversified customer') || lowerDesc.includes('broad customer base')) {
    metrics.customerBase = 'Diversified Customer Base';
  } else if (lowerDesc.includes('concentrated') || lowerDesc.includes('key customers')) {
    metrics.customerBase = 'Concentrated Customer Base';
  } else if (lowerDesc.includes('b2b') || lowerDesc.includes('business-to-business')) {
    metrics.customerBase = 'B2B Customer Focus';
  } else if (lowerDesc.includes('consumer') || lowerDesc.includes('b2c')) {
    metrics.customerBase = 'Consumer Market Focus';
  }
  
  return metrics;
}

/**
 * Generate comprehensive risk assessment based on business description and financials
 */
export function generateRiskAssessment(
  _description: string,
  category: string,
  revenue: number, 
  ebitda: number,
  extractedMetrics: ExtractedFinancials
): RiskAssessment {
  const ebitdaMargin = revenue > 0 ? (ebitda / revenue) * 100 : 0;
  
  let riskLevel: RiskAssessment['level'] = 'Medium';
  const factors: string[] = [];
  const industryRisks: string[] = [];
  const mitigationFactors: string[] = [];
  let confidence = 0.7;
  
  // Financial stability assessment
  if (ebitdaMargin >= 20 && revenue >= 10000000) {
    riskLevel = 'Low';
    mitigationFactors.push('Strong financial performance with healthy margins');
    confidence += 0.1;
  } else if (ebitdaMargin >= 15 && revenue >= 5000000) {
    riskLevel = 'Low-Medium';
    mitigationFactors.push('Solid financial fundamentals');
  } else if (ebitdaMargin < 5 || revenue < 1000000) {
    riskLevel = 'Medium-High';
    factors.push('Lower profitability margins require operational improvements');
  }
  
  // Industry-specific risks
  const industryRiskProfiles = {
    'Technology': ['Technology disruption risk', 'Rapid innovation cycles', 'Talent competition'],
    'Healthcare': ['Regulatory compliance risk', 'Reimbursement changes', 'Liability exposure'],
    'Manufacturing': ['Commodity price volatility', 'Supply chain disruption', 'Capital intensity'],
    'Services': ['People dependency', 'Client concentration risk', 'Economic sensitivity'],
    'Retail': ['Consumer spending sensitivity', 'E-commerce competition', 'Inventory management'],
    'Food & Beverage': ['Food safety regulations', 'Supply chain complexity', 'Consumer preference shifts']
  };
  
  if (industryRiskProfiles[category as keyof typeof industryRiskProfiles]) {
    industryRisks.push(...industryRiskProfiles[category as keyof typeof industryRiskProfiles]);
  }
  
  // Business model risks
  if (extractedMetrics.riskFactors?.includes('customer concentration')) {
    factors.push('Customer concentration creates revenue dependency risk');
    if (riskLevel === 'Low') riskLevel = 'Low-Medium';
    else if (riskLevel === 'Low-Medium') riskLevel = 'Medium';
  }
  
  if (extractedMetrics.riskFactors?.includes('competition')) {
    factors.push('Competitive market environment');
  }
  
  if (extractedMetrics.riskFactors?.includes('cyclical')) {
    factors.push('Business cyclicality affects revenue predictability');
    if (riskLevel === 'Low') riskLevel = 'Low-Medium';
  }
  
  
  if ((extractedMetrics.competitiveAdvantages?.length ?? 0) > 0) {
    mitigationFactors.push(`Competitive advantages reduce market risk`);
    confidence += 0.1;
  }
  
  if (extractedMetrics.revenueModel === 'Recurring Revenue Model') {
    mitigationFactors.push('Recurring revenue model provides cash flow predictability');
    if (riskLevel === 'Medium-High') riskLevel = 'Medium';
    else if (riskLevel === 'Medium') riskLevel = 'Low-Medium';
  }
  
  return {
    level: riskLevel,
    factors: factors.length > 0 ? factors : ['Standard business and market risks apply'],
    industryRisks,
    mitigationFactors: mitigationFactors.length > 0 ? mitigationFactors : ['Business fundamentals support investment case'],
    confidence: Math.min(confidence, 1.0)
  };
}

/**
 * Generate custom investment thesis from business description
 */
export function generateCustomInvestmentThesis(
  description: string,
  category: string,
  location: string,
  revenue: number,
  ebitda: number
): CustomInvestmentThesis {
  const extractedMetrics = extractFinancialMetrics(description);
  const riskAssessment = generateRiskAssessment(description, category, revenue, ebitda, extractedMetrics);
  
  // Generate overview based on extracted insights
  let overview = 'Well-positioned business ';
  
  if (extractedMetrics.revenueModel) {
    overview += `with ${extractedMetrics.revenueModel.toLowerCase()} `;
  }
  
  overview += `operating in the ${category.toLowerCase()} sector. `;
  
  if (revenue > 0) {
    overview += `Generates $${(revenue / 1000000).toFixed(1)}M in annual revenue `;
    if (ebitda > 0) {
      const margin = (ebitda / revenue) * 100;
      overview += `with ${margin.toFixed(1)}% EBITDA margins.`;
    }
  }
  
  // Key strengths from extracted data
  const keyStrengths: string[] = [];
  
  if ((extractedMetrics.competitiveAdvantages?.length ?? 0) > 0) {
    keyStrengths.push(`Competitive advantages in ${extractedMetrics.competitiveAdvantages!.slice(0, 2).join(', ')}`);
  }
  
  if (extractedMetrics.customerBase) {
    keyStrengths.push(extractedMetrics.customerBase);
  }
  
  if (revenue >= 10000000 && ebitda > 0) {
    keyStrengths.push('Proven scalability with strong financial performance');
  }
  
  // Investment highlights
  const investmentHighlights: string[] = [];
  
  if ((extractedMetrics.growthDrivers?.length ?? 0) > 0) {
    investmentHighlights.push(`Growth drivers: ${extractedMetrics.growthDrivers!.slice(0, 2).join(', ')}`);
  }
  
  if ((extractedMetrics.marketTrends?.length ?? 0) > 0) {
    investmentHighlights.push(`Favorable market trends: ${extractedMetrics.marketTrends!.slice(0, 2).join(', ')}`);
  }
  
  if (extractedMetrics.revenueModel === 'Recurring Revenue Model') {
    investmentHighlights.push('Predictable recurring revenue streams');
  }
  
  // Growth opportunity
  let growthOpportunity = '';
  if ((extractedMetrics.growthDrivers?.length ?? 0) > 0) {
    growthOpportunity = `Multiple growth vectors including ${extractedMetrics.growthDrivers!.slice(0, 3).join(', ')}`;
  } else {
    growthOpportunity = 'Organic growth opportunities through market expansion and operational improvements';
  }
  
  // Market position
  let marketPosition = 'Established market participant';
  if (location) {
    marketPosition += ` with strong ${location} presence`;
  }
  
  // Calculate confidence
  let confidence = 0.6;
  if ((extractedMetrics.competitiveAdvantages?.length ?? 0) > 0) confidence += 0.1;
  if ((extractedMetrics.growthDrivers?.length ?? 0) > 0) confidence += 0.1;
  if (revenue > 0 && ebitda > 0) confidence += 0.1;
  
  return {
    overview,
    keyStrengths: keyStrengths.length > 0 ? keyStrengths : [
      'Established business operations',
      'Industry experience and expertise',
      'Market presence and customer relationships'
    ],
    growthOpportunity,
    marketPosition,
    competitiveAdvantages: extractedMetrics.competitiveAdvantages || [],
    investmentHighlights: investmentHighlights.length > 0 ? investmentHighlights : [
      'Stable revenue base',
      'Growth potential in expanding market'
    ],
    riskAssessment,
    confidence: Math.min(confidence, 1.0)
  };
}

/**
 * Map free-text location to standardized region
 */
export function mapToStandardizedLocation(location: string): StandardizedLocation {
  const lowerLocation = location.toLowerCase();
  
  // US regions
  if (/northeast|new england|new york|boston|philadelphia|washington dc|maine|vermont|new hampshire|massachusetts|rhode island|connecticut|new jersey|pennsylvania|delaware|maryland/i.test(lowerLocation)) {
    return 'Northeast US';
  }
  if (/southeast|south east|florida|georgia|carolina|virginia|tennessee|kentucky|alabama|mississippi|louisiana|arkansas/i.test(lowerLocation)) {
    return 'Southeast US';
  }
  if (/southwest|south west|texas|arizona|new mexico|oklahoma/i.test(lowerLocation)) {
    return 'Southwest US';
  }
  if (/west|western|california|oregon|washington|seattle|san francisco|los angeles|portland|nevada|utah|colorado/i.test(lowerLocation)) {
    return 'Western US';
  }
  if (/midwest|illinois|indiana|ohio|michigan|wisconsin|minnesota|iowa|missouri|kansas|nebraska|north dakota|south dakota/i.test(lowerLocation)) {
    return 'Midwest US';
  }
  
  // North America
  if (/united states|usa|america/i.test(lowerLocation)) {
    return 'United States';
  }
  if (/canada|canadian/i.test(lowerLocation)) {
    return 'Canada';
  }
  if (/north america|north american/i.test(lowerLocation)) {
    return 'North America';
  }
  
  // International
  if (/united kingdom|uk|england|scotland|wales|london|manchester|birmingham/i.test(lowerLocation)) {
    return 'United Kingdom';
  }
  if (/europe|european|germany|france|netherlands|belgium|spain|italy|switzerland|austria|denmark|sweden|norway|poland|czech|hungary/i.test(lowerLocation)) {
    return 'Europe';
  }
  if (/asia|asian|japan|china|singapore|hong kong|south korea|taiwan|india|pacific/i.test(lowerLocation)) {
    return 'Asia Pacific';
  }
  
  return 'Global/International';
}

/**
 * Calculate investment metrics
 */
export function calculateInvestmentMetrics(revenue: number, ebitda: number) {
  return {
    ebitdaMargin: revenue > 0 ? ((ebitda / revenue) * 100).toFixed(1) : '0',
    revenueMultiple: ebitda > 0 ? (revenue / ebitda).toFixed(1) : '0',
    roiPotential: ebitda > 25000000 ? 'High' : ebitda > 10000000 ? 'Medium' : 'Conservative',
    scalabilityScore: revenue > 50000000 ? 95 : revenue > 20000000 ? 85 : revenue > 10000000 ? 75 : 65
  };
}

export function calculateLocationMatchScore(userLocations: string[], listingLocation: string): number {
  if (!userLocations.length || !listingLocation) return 0;
  
  // Normalize strings for comparison - handle edge cases
  const normalizeLocation = (loc: string) => {
    if (!loc || typeof loc !== 'string') return '';
    return loc.trim().toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ');
  };
  
  const normalizedListing = normalizeLocation(listingLocation);
  const normalizedUserLocations = userLocations.map(normalizeLocation).filter(Boolean);
  
  if (!normalizedUserLocations.length || !normalizedListing) return 0;
  
  // Handle 'All Locations' option
  if (normalizedUserLocations.includes('all locations')) {
    return 100;
  }
  
  // CRITICAL FIX: Direct exact match (case-insensitive) - this should return 100%
  if (normalizedUserLocations.includes(normalizedListing)) {
    return 100;
  }
  
  // Regional and proximity matching with corrected hierarchical logic
  const locationHierarchy = {
    'United States': [
      'Northeast US', 'Southeast US', 'Southwest US', 'Northwest US', 
      'Midwest US', 'West Coast US', 'East Coast US'
    ],
    'Canada': ['Western Canada', 'Eastern Canada'],
    'Europe': [
      'Western Europe', 'Eastern Europe', 'Northern Europe', 'Southern Europe',
      'United Kingdom', 'Germany', 'France', 'Spain', 'Italy'
    ],
    'Asia': [
      'East Asia', 'Southeast Asia', 'South Asia', 'Central Asia',
      'China', 'Japan', 'India', 'Singapore'
    ]
  };
  
  // FIXED: Check if listing location is a sub-region and user selected the parent region
  for (const [parentRegion, subRegions] of Object.entries(locationHierarchy)) {
    const normalizedSubRegions = subRegions.map(normalizeLocation);
    const normalizedParent = normalizeLocation(parentRegion);
    
    // If listing is in a sub-region and user selected the parent region
    if (normalizedSubRegions.includes(normalizedListing) && normalizedUserLocations.includes(normalizedParent)) {
      return 100; // Perfect hierarchical match
    }
    
    // If listing is parent region and user selected a sub-region
    if (normalizedListing === normalizedParent && normalizedUserLocations.some(loc => normalizedSubRegions.includes(loc))) {
      return 100; // Perfect hierarchical match
    }
    
    // If both are sub-regions of the same parent
    if (normalizedSubRegions.includes(normalizedListing)) {
      const matchingSubRegions = normalizedUserLocations.filter(loc => normalizedSubRegions.includes(loc));
      if (matchingSubRegions.length > 0) {
        return 75; // Good regional match
      }
    }
  }
  
  // Check if user selected a sub-region and listing is in the parent region
  for (const userLocation of userLocations) {
    const normalizedUserLoc = normalizeLocation(userLocation);
    for (const [parentRegion, subRegions] of Object.entries(locationHierarchy)) {
      const normalizedSubRegions = subRegions.map(normalizeLocation);
      const normalizedParent = normalizeLocation(parentRegion);
      
      if (normalizedSubRegions.includes(normalizedUserLoc) && normalizedListing === normalizedParent) {
        return 100; // Perfect match for hierarchical relationship
      }
    }
  }
  
  // Continental proximity matching
  const continentalGroups = {
    northAmerica: ['United States', 'Canada', 'Mexico', 'Northeast US', 'Southeast US', 'Southwest US', 'Northwest US', 'Midwest US', 'West Coast US', 'East Coast US', 'Western Canada', 'Eastern Canada'],
    europe: ['Europe', 'Western Europe', 'Eastern Europe', 'Northern Europe', 'Southern Europe', 'United Kingdom', 'Germany', 'France', 'Spain', 'Italy'],
    asia: ['Asia', 'East Asia', 'Southeast Asia', 'South Asia', 'Central Asia', 'China', 'Japan', 'India', 'Singapore'],
    other: ['Australia', 'Global', 'Remote', 'Worldwide']
  };
  
  for (const [, locations] of Object.entries(continentalGroups)) {
    const normalizedGroupLocations = locations.map(normalizeLocation);
    const userInGroup = normalizedUserLocations.some(loc => normalizedGroupLocations.includes(loc));
    const listingInGroup = normalizedGroupLocations.includes(normalizedListing);
    if (userInGroup && listingInGroup) {
      return 50; // Same continental region
    }
  }
  
  return 0; // No match
}