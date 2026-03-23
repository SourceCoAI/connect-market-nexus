// Scoring Components (unified)
export { ScoreBadge, getTierFromScore } from '@/components/shared/ScoreBadge';
export { NotAFitReasonDialog } from './NotAFitReasonDialog';
export { IntelligenceBadge } from './IntelligenceBadge';
export { ScoreFilters, filterScores } from './ScoreFilters';
export type { ScoreFiltersState } from './ScoreFilters';

// Universe Components
export { StructuredCriteriaPanel } from './StructuredCriteriaPanel';
export { DocumentUploadSection } from './DocumentUploadSection';
export { MAGuideEditor } from './MAGuideEditor';
export { UniverseTemplates } from './UniverseTemplates';
export { ScoringBehaviorPanel } from './ScoringBehaviorPanel';
export { ScoringInsightsPanel } from './ScoringInsightsPanel';
export { ScoringInstructionsPanel } from './ScoringInstructionsPanel';
export { PassConfirmDialog } from './PassConfirmDialog';
export { BulkEmailDialog } from './BulkEmailDialog';
export { TargetBuyerTypesPanel } from './TargetBuyerTypesPanel';
export { AdditionalCriteriaDisplay } from './AdditionalCriteriaDisplay';
export { BuyerFitCriteriaAccordion } from './BuyerFitCriteriaAccordion';
export { BuyerFitCriteriaDialog } from './BuyerFitCriteriaDialog';
export { BuyerTableToolbar } from './BuyerTableToolbar';
export { ScoringStyleCard } from './ScoringStyleCard';

// Match Card Components
export { BuyerMatchCard } from './BuyerMatchCard';
export { ApproveBuyerMultiDealDialog } from './ApproveBuyerMultiDealDialog';
export { BulkApproveForDealsDialog } from './BulkApproveForDealsDialog';

// Table Components
export { BuyerTableEnhanced } from './BuyerTableEnhanced';
export { AlignmentScoreBadge } from './AlignmentScoreBadge';
export { UniverseDealsTable } from './UniverseDealsTable';
export { DealMergePanel } from './DealMergePanel';

// Deal Management Components
export { AddDealToUniverseDialog } from './AddDealToUniverseDialog';
export { AddDealDialog } from './AddDealDialog';
export { AddToUniverseQuickAction } from './AddToUniverseQuickAction';
export { DealCSVImport } from './DealCSVImport';

// Analytics Components
export { MatchingFunnel } from './MatchingFunnel';
export { TierDistributionChart } from './TierDistributionChart';
export { ScoringTrendsChart } from './ScoringTrendsChart';
export { CategoryPerformanceChart } from './CategoryPerformanceChart';
export { UniversePerformanceTable } from './UniversePerformanceTable';
export { DecisionHistoryChart } from './DecisionHistoryChart';
export { ScoreCalibrationChart } from './ScoreCalibrationChart';

// Integration Components
export { ReMarketingBadge } from './ReMarketingBadge';

// Import Components
export { default as BuyerCSVImport } from './BuyerCSVImport/index';
export { DealImportDialog } from './DealImportDialog';
export type { DealIdMapping } from './DealMergePanel';

// Outreach/Introduction Components
export { OutreachTimeline } from './OutreachTimeline';
export { OutreachStatusDialog } from './OutreachStatusDialog';
export type { OutreachStatus } from './OutreachStatusDialog';

// Layout Components
export { ReMarketingLayout } from './ReMarketingLayout';
export { IntelligenceCoverageBar } from './IntelligenceCoverageBar';

// Bulk Actions & Progress
export { DealBulkActionBar } from './DealBulkActionBar';
export { AddBuyersToListDialog } from './AddBuyersToListDialog';
export { AddDealsToListDialog } from './AddDealsToListDialog';
export type { DealForList } from './AddDealsToListDialog';
export { PushToHeyreachModal } from './PushToHeyreachModal';
export { ScoringProgressIndicator } from './ScoringProgressIndicator';
export { EnrichmentProgressIndicator } from './EnrichmentProgressIndicator';
export { EnrichmentSummaryDialog } from './EnrichmentSummaryDialog';
export { DealEnrichmentSummaryDialog } from './DealEnrichmentSummaryDialog';

// Email Generation
export { EmailPreviewDialog } from './EmailPreviewDialog';

// Pipeline Components
export { PipelineSummaryCard } from './PipelineSummaryCard';

// Transcript Components
export { DealTranscriptSection } from './DealTranscriptSection';

// Guide & Criteria Input Components
export { TrackerNotesSection } from './TrackerNotesSection';
export { AIResearchSection } from './AIResearchSection';
export { CriteriaValidationAlert, CriteriaValidationBadge } from './CriteriaValidationAlert';
export { GenerationSummaryPanel } from './GenerationSummaryPanel';
export type { GenerationSummary, GenerationOutcome } from './GenerationSummaryPanel';

// Referral Partner Components
export { AddPartnerDialog } from './AddPartnerDialog';
export { SubmissionReviewQueue } from './SubmissionReviewQueue';
export { ReferralSubmissionForm } from './ReferralSubmissionForm';
export { ReferralCSVUpload } from './ReferralCSVUpload';

// Deal Source Components
export { DealSourceBadge } from './DealSourceBadge';
