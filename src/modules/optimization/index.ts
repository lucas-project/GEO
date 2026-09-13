/**
 * Optimization module — public surface (Phase 3).
 */

export {
  optimizationService,
  generateArtifact,
  listArtifactsForAudit,
  applyArtifactToWordpress,
  markOptimizationApplied,
} from './service';
export { ARTIFACT_TYPES } from './schemas';
export { disposeArtifact, recheckArtifact, readArtifactVerification } from './workflow';
export type { GeneratedArtifact, ArtifactType } from './schemas';
export { pickAdapter as pickCmsAdapter } from './cms';
export type { CmsAdapter, CmsPatchInput, CmsPatchResult } from './cms';
