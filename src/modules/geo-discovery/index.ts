/**
 * GEO discovery module — client-safe public surface.
 * Server pipeline: `@modules/geo-discovery/server`.
 */

export { classifyUrl } from './classify-url';
export type {
  DiscoverGeoPagesResult,
  GeoDiscoveredPage,
  DiscoveryProgressCallback,
} from './types';
