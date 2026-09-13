/**
 * Adaptive GEO discovery adjustments (foundation stub).
 * Future: read PageArchetypeStat from DB and apply learned boosts.
 */

import type { PageArchetype } from '@modules/geo-audit';

export function archetypeLearningBoost(_siteHost: string, _archetype: PageArchetype): number {
  return 0;
}
