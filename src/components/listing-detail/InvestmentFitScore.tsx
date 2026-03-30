import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { calculateLocationMatchScore, calculateIndustryMatchScore } from '@/lib/financial-parser';
import { parseCurrency } from '@/lib/currency-utils';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { formatFinancialRange } from '@/lib/buyer-metrics';
import { computeMatchScore, extractBuyerCriteria } from '@/lib/match-scoring';
import { CheckCircle2, XCircle, Sparkles } from 'lucide-react';
import { Listing } from '@/types';

interface InvestmentFitScoreProps {
  revenue: number;
  ebitda: number;
  category: string;
  location: string;
  /** Optional full listing object — when provided, enables AI match explanations. */
  listing?: Listing;
}

interface FitCriteria {
  name: string;
  score: number;
  weight: number;
  details: string;
}

export function InvestmentFitScore({
  revenue,
  category,
  location,
  listing,
}: InvestmentFitScoreProps) {
  const { user } = useAuth();

  // ── AI Match Explanation (uses shared scoring utility) ────────────────
  // Must be called before any early returns to satisfy rules-of-hooks.
  const matchExplanation = useMemo(() => {
    if (!user || !listing) return null;

    const criteria = extractBuyerCriteria(user);
    if (criteria.criteriaCount < 2) return null;

    return computeMatchScore(
      listing,
      criteria.buyerCategories,
      criteria.buyerLocations,
      criteria.revenueMin,
      criteria.revenueMax,
      criteria.ebitdaMin,
      criteria.ebitdaMax,
      criteria.dealIntent,
    );
  }, [listing, user]);

  if (!user) {
    return (
      <Card className="border-sourceco-form bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="document-label">Investment Fit Analysis</CardTitle>
        </CardHeader>
        <CardContent className="py-8 text-center">
          <p className="document-subtitle mb-6">
            Sign in to see how well this opportunity matches your investment criteria
          </p>
          <Button variant="outline" className="text-sm" asChild>
            <Link to="/login">Sign In</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // After null check, create a non-null reference for use in inner functions
  const currentUser = user;

  // SIMPLIFIED: Now that data is standardized as JSONB arrays
  const userTargetLocations = Array.isArray(currentUser.target_locations)
    ? currentUser.target_locations.filter(Boolean)
    : [];

  const userCategories = currentUser.business_categories
    ? Array.isArray(currentUser.business_categories)
      ? currentUser.business_categories
      : typeof currentUser.business_categories === 'string'
        ? (currentUser.business_categories as string).startsWith('[')
          ? (() => {
              try {
                return JSON.parse(currentUser.business_categories as string);
              } catch {
                return [currentUser.business_categories as string];
              }
            })()
          : [currentUser.business_categories as string]
        : []
    : [];

  function calculateFitScore(): { score: number; criteria: FitCriteria[] } {
    const listingLocation = location;

    // Check profile completeness first
    const profileCompleteness = getProfileCompleteness();
    if (profileCompleteness < 40) {
      return {
        score: 0,
        criteria: [
          {
            name: 'Profile Incomplete',
            score: 0,
            weight: 100,
            details: `Profile only ${profileCompleteness}% complete. Complete your profile for accurate fit analysis.`,
          },
        ],
      };
    }

    let totalWeight = 0;
    let weightedScore = 0;
    const criteria: FitCriteria[] = [];

    // Revenue Range Matching (30% weight)
    const revenueWeight = 30;
    let revenueScore = 0;
    let revenueDetails = '';

    if (currentUser.revenue_range_min != null || currentUser.revenue_range_max != null) {
      const minRange = currentUser.revenue_range_min
        ? parseCurrency(String(currentUser.revenue_range_min))
        : 0;
      const maxRange = currentUser.revenue_range_max
        ? parseCurrency(String(currentUser.revenue_range_max))
        : Infinity;

      if (revenue >= minRange && revenue <= maxRange) {
        revenueScore = 100;
        revenueDetails = `Perfect match within your range`;
      } else if (revenue < minRange) {
        const ratio = revenue / minRange;
        revenueScore = Math.max(0, ratio * 80);
        revenueDetails = `Below your minimum target`;
      } else {
        const ratio = maxRange / revenue;
        revenueScore = Math.max(0, ratio * 80);
        revenueDetails = `Above your maximum target`;
      }
      totalWeight += revenueWeight;
      weightedScore += (revenueScore * revenueWeight) / 100;
    } else {
      revenueDetails = 'Not specified in profile';
    }

    criteria.push({
      name: 'Revenue Match',
      score: revenueScore,
      weight: revenueWeight,
      details: revenueDetails,
    });

    // Smart Location Matching (25% weight)
    const locationWeight = 25;
    let locationScore = 0;
    let locationDetails = '';

    if (userTargetLocations.length > 0) {
      locationScore = calculateLocationMatchScore(userTargetLocations, listingLocation);

      if (locationScore === 100) {
        locationDetails = 'Exact location match';
      } else if (locationScore === 75) {
        locationDetails = 'Regional proximity match';
      } else if (locationScore === 50) {
        locationDetails = 'Broader area match';
      } else {
        locationDetails = 'Different geographic area';
      }
      totalWeight += locationWeight;
      weightedScore += (locationScore * locationWeight) / 100;
    } else {
      locationDetails = 'Not specified in profile';
    }

    criteria.push({
      name: 'Location Match',
      score: locationScore,
      weight: locationWeight,
      details: locationDetails,
    });

    // Smart Industry/Category Matching (25% weight)
    const categoryWeight = 25;
    let categoryScore = 0;
    let categoryDetails = '';

    if (userCategories.length > 0) {
      categoryScore = calculateIndustryMatchScore(userCategories, category);

      if (categoryScore === 100) {
        if (userCategories.includes('All Industries')) {
          categoryDetails = 'Matches your open sector approach';
        } else {
          categoryDetails = 'Direct industry alignment';
        }
      } else if (categoryScore === 80) {
        categoryDetails = 'Related industry sector';
      } else if (categoryScore === 70) {
        categoryDetails = 'Adjacent business category';
      } else {
        categoryDetails = 'Different industry focus';
      }
      totalWeight += categoryWeight;
      weightedScore += (categoryScore * categoryWeight) / 100;
    } else {
      categoryDetails = 'Not specified in profile';
    }

    criteria.push({
      name: 'Industry Match',
      score: categoryScore,
      weight: categoryWeight,
      details: categoryDetails,
    });

    // Investment Size Matching (20% weight)
    const sizeWeight = 20;
    let sizeScore = 0;
    let sizeDetails = '';

    if (currentUser.investment_size) {
      const investmentSize = Array.isArray(currentUser.investment_size)
        ? currentUser.investment_size.join(' ').toLowerCase()
        : typeof currentUser.investment_size === 'string'
          ? currentUser.investment_size.toLowerCase()
          : '';

      if (investmentSize.includes('small') || investmentSize.includes('<5m')) {
        sizeScore = revenue < 10000000 ? 100 : revenue < 25000000 ? 75 : 50;
        sizeDetails =
          sizeScore === 100 ? 'Ideal size for small deals' : 'Larger than small deal preference';
      } else if (investmentSize.includes('medium') || investmentSize.includes('5-25m')) {
        sizeScore = revenue >= 5000000 && revenue <= 50000000 ? 100 : 75;
        sizeDetails = sizeScore === 100 ? 'Perfect for medium deals' : 'Outside medium deal range';
      } else if (investmentSize.includes('large') || investmentSize.includes('>25m')) {
        sizeScore = revenue > 25000000 ? 100 : revenue > 10000000 ? 75 : 50;
        sizeDetails =
          sizeScore === 100 ? 'Suitable for large deals' : 'Smaller than large deal preference';
      } else {
        sizeScore = 75;
        sizeDetails = 'General size compatibility';
      }

      totalWeight += sizeWeight;
      weightedScore += (sizeScore * sizeWeight) / 100;
    } else {
      sizeDetails = 'Not specified in profile';
    }

    criteria.push({
      name: 'Investment Size',
      score: sizeScore,
      weight: sizeWeight,
      details: sizeDetails,
    });

    // Final guard against meaningless scores
    if (totalWeight === 0) {
      return {
        score: 0,
        criteria: [
          {
            name: 'No Matching Criteria',
            score: 0,
            weight: 100,
            details:
              'No investment criteria found in your profile. Update your preferences to see fit analysis.',
          },
        ],
      };
    }

    const finalScore = totalWeight > 0 ? (weightedScore / totalWeight) * 100 : 0;
    return { score: finalScore, criteria };
  }

  function getProfileCompleteness(): number {
    const fields = [
      currentUser.revenue_range_min != null || currentUser.revenue_range_max != null,
      userTargetLocations.length > 0,
      userCategories.length > 0,
      currentUser.investment_size,
      currentUser.buyer_type,
    ];

    const completedFields = fields.filter(Boolean).length;
    return (completedFields / fields.length) * 100;
  }

  const { score: overallScore, criteria } = calculateFitScore();
  const profileCompleteness = getProfileCompleteness();

  const getScoreLabel = (score: number): string => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    if (score >= 20) return 'Poor';
    return 'No Match';
  };

  return (
    <Card className="border-sourceco-form bg-white">
      <CardHeader className="pb-3">
        <CardTitle className="document-label">Investment Fit Analysis</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Overall Score - Hyper-Minimal */}
        <div className="text-center py-2">
          <div className="text-4xl font-light text-slate-900 mb-1">{Math.round(overallScore)}%</div>
          <div className="document-subtitle">{getScoreLabel(overallScore)} Match</div>
        </div>

        {/* AI Match Explanation — why this deal matches (or doesn't) */}
        {matchExplanation && matchExplanation.reasons.length > 0 && (
          <div className="space-y-1.5 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles className="h-3.5 w-3.5 text-purple-600" />
              <h4 className="text-xs font-medium text-slate-900">Why This Deal Matches</h4>
            </div>
            <ul className="space-y-1.5">
              {matchExplanation.reasons.map((reason, i) => (
                <li key={i} className="flex items-start gap-2">
                  {reason.matched ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-slate-300 mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <span
                      className={`text-xs ${reason.matched ? 'font-medium text-slate-900' : 'text-slate-400'}`}
                    >
                      {reason.label}
                    </span>
                    <span
                      className={`text-xs ${reason.matched ? 'text-slate-600' : 'text-slate-400'} ml-1`}
                    >
                      — {reason.detail}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Criteria Analysis - Ultra Clean */}
        <div className="space-y-2 pt-3">
          {criteria.map((criterion) => (
            <div key={criterion.name} className="flex items-center justify-between py-1">
              <div className="flex-1">
                <div className="text-xs font-medium text-slate-900">{criterion.name}</div>
                <div className="text-xs text-slate-500">{criterion.details}</div>
              </div>
              <div className="text-xs font-medium text-slate-900 ml-4">
                {Math.round(criterion.score)}%
              </div>
            </div>
          ))}
        </div>

        {/* Profile Data & Completion - Consolidated */}
        <div className="space-y-2 pt-3 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-medium text-slate-900">Profile Analysis</h4>
            {profileCompleteness < 100 && (
              <span className="text-xs text-slate-500">
                {Math.round(profileCompleteness)}% complete
              </span>
            )}
          </div>

          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Revenue Range:</span>
              <span className="text-slate-900 text-right max-w-[60%]">
                {formatFinancialRange(currentUser.revenue_range_min, currentUser.revenue_range_max)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Target Locations:</span>
              <span className="text-slate-900 text-right max-w-[60%]">
                {userTargetLocations.length > 0 ? userTargetLocations.join(', ') : 'Not set'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Target Industries:</span>
              <span className="text-slate-900 text-right max-w-[60%]">
                {userCategories.length > 0 ? userCategories.join(', ') : 'Not set'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Investment Size:</span>
              <span className="text-slate-900 text-right">
                {Array.isArray(currentUser.investment_size)
                  ? currentUser.investment_size.join(', ')
                  : currentUser.investment_size || 'Not set'}
              </span>
            </div>
          </div>

          {profileCompleteness < 100 && (
            <div className="pt-2">
              <div className="w-full bg-slate-100 rounded-full h-0.5">
                <div
                  className="h-0.5 bg-slate-400 rounded-full transition-all duration-300"
                  style={{ width: `${profileCompleteness}%` }}
                />
              </div>
              <Button variant="outline" className="w-full text-xs h-8 mt-2" asChild>
                <Link to="/profile">Update Profile</Link>
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
