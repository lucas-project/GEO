/**
 * GEO Audit module — client-safe public surface (types, scoring copy, grouping).
 * Server pipeline: `@modules/geo-audit/server`.
 */

export { groupAuditsBySite } from './group-by-site';
export type { AuditListRow, SiteAuditGroup } from './group-by-site';
export { ARCHETYPE_LABELS, ARCHETYPE_DISPLAY_ORDER } from './archetype-labels';
export {
  DIMENSIONS,
  DIMENSION_LABELS,
  DIMENSION_DESCRIPTIONS,
  DIMENSION_LAYERS,
  SCORE_LAYERS,
  LAYER_LABELS,
  LAYER_DESCRIPTIONS,
  DimensionScoreSchema,
  ScoringMetaSchema,
} from './schemas';
export type {
  Dimension,
  DimensionScore,
  ScoreLayer,
  LayerScore,
  LayerEvidence,
  LayerEvidenceItem,
  ScoringMeta,
  Bottleneck,
  GateApplied,
  GeoAuditResult,
  Issue,
  Fix,
  PageInventory,
  AuditPageEntry,
  PageArchetype,
  DiscoverySource,
  PageIssueImpact,
  PageCodeHighlight,
  SourceRange,
} from './schemas';
export { ObservationStatusSchema, EvidenceMethodSchema, EvidenceSchema, CriterionResultSchema, EvidenceBundleSchema } from './evidence-schema';
export type { ObservationStatus, EvidenceMethod, Evidence, CriterionResult, EvidenceBundle } from './evidence-schema';
export { buildEvidenceBundle } from './evidence';
export { selectAuditRootPage } from './root-page';
export {
  resolveAuditExecutionState,
  resolveDisplayedAuditStatus,
} from './resolve-audit-execution-state';
export type { AuditReportStatus, AuditExecutionState } from './resolve-audit-execution-state';
export { evaluateReadinessCriteria, READINESS_RULE_VERSION } from './criteria';
export { computeReadinessScore } from './scoring-v3';
export type { ReadinessScore } from './scoring-v3';
export type { RefCategoryScores } from './checklist-schema';
export { REF_TIER_LABELS } from './ref-category-scores';
export { locateHeadingTagRanges } from './locate-in-source';
export { deriveScoringMetaFromDimensions } from './hierarchical-scoring';
export { buildImprovementPlan, ARTIFACT_LABELS } from './improvement-plan';
export {
  SIMULATION_QUESTION_TYPES,
  SIMULATION_QUESTION_TYPE_LABELS,
  SIMULATION_QUESTION_TYPE_DESCRIPTIONS,
  SIMULATION_PROMPTS_PER_TYPE,
  normalizeSimulationPrompts,
  simulationPromptText,
  countSimulationPrompts,
  resolveQuestionTypes,
  expectedSimulationPromptCount,
} from './simulation-prompts';
export type {
  SimulationQuestionType,
  SimulationPromptEntry,
  SimulationQuestionTypesInput,
} from './simulation-prompts';
export type {
  ImprovementPlanItem,
  ImprovementPlanItemKind,
  ImprovementPlanItemStatus,
} from './improvement-plan';
export { PAGE_ARCHETYPES, DISCOVERY_SOURCES } from './schemas';
export {
  plainDimensionLabel,
  plainWhatWeCheck,
  GATE_LAYERS,
  plainGateExplanation,
  LAYER_SCORING_INTRO,
  dimensionsForLayer,
  plainImpact,
  plainIssueSummary,
  expandReason,
  isNegativeReason,
} from './plain-language';
export { canReadPage } from './current-observations';
