// Scoring Components (unified)
export { ScoreBadge, getTierFromScore } from '@/components/shared/ScoreBadge';
export { ScoreBreakdown } from './ScoreBreakdown';
export { AIReasoningPanel } from './AIReasoningPanel';
export { PassReasonDialog } from './PassReasonDialog';
export { IntelligenceBadge } from './IntelligenceBadge';
export { BulkScoringPanel } from './BulkScoringPanel';
export { ScoreFilters, filterScores } from './ScoreFilters';
export type { ScoreFiltersState } from './ScoreFilters';

// Engagement Components
export { EngagementIndicator, getEngagementLevel } from './EngagementIndicator';
export { StaleScoreWarning } from './StaleScoreWarning';
export { EngagementHeatmapInsight } from './EngagementHeatmapInsight';

// Enrichment Components
export { EnrichmentButton } from './EnrichmentButton';

// Universe Components
export { StructuredCriteriaPanel } from './StructuredCriteriaPanel';
export { DocumentUploadSection } from './DocumentUploadSection';
export { MAGuideEditor } from './MAGuideEditor';
export { UniverseTemplates } from './UniverseTemplates';
export { ScoringBehaviorPanel } from './ScoringBehaviorPanel';
export { ScoringBehaviorPanelEnhanced } from './ScoringBehaviorPanelEnhanced';
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

// Transcript Components
export { TranscriptSection } from './TranscriptSection';


// Outreach/Introduction Components
export { OutreachTimeline } from './OutreachTimeline';
export { IntroductionStatusCard } from './IntroductionStatusCard';
export { OutreachStatusDialog } from './OutreachStatusDialog';
export type { OutreachStatus } from './OutreachStatusDialog';

// Learning Components
export { QuickInsightsWidget } from './QuickInsightsWidget';

// Layout Components
export { ReMarketingSidebar } from './ReMarketingSidebar';
export { ReMarketingLayout } from './ReMarketingLayout';
export { IntelligenceCoverageBar } from './IntelligenceCoverageBar';
export { ScoringInsightsSidebar } from './ScoringInsightsSidebar';

// Bulk Actions & Progress
export { BulkActionsToolbar } from './BulkActionsToolbar';
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

// Phase 4: CRM & Enterprise
export { CRMExportPanel } from './CRMExportPanel';
export { OutreachSequenceTracker } from './OutreachSequenceTracker';

// Phase 5: Advanced Analytics
export { WinRateAnalysis } from './WinRateAnalysis';
export { OutreachVelocityDashboard } from './OutreachVelocityDashboard';

// Dashboard Widgets
export { UnlinkedListingsWidget } from './UnlinkedListingsWidget';

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
