import type { AuditPageEntry, DiscoverySource, PageArchetype } from '@modules/geo-audit';

export interface DiscoveryCandidate {
  url: string;
  sources: Set<DiscoverySource>;
  navWeight: number;
  anchorTexts: string[];
  lastmod: string | null;
  title: string | null;
}

export interface GeoDiscoveredPage extends AuditPageEntry {
  geoScore: number;
  archetype: PageArchetype;
  signals: string[];
  probed: boolean;
  sources: DiscoverySource[];
}

export interface DiscoverGeoPagesResult {
  url: string;
  pages: GeoDiscoveredPage[];
  suggestedUrls: string[];
  maxSelectable: number;
  discoveredCount: number;
  probedCount: number;
}

export type DiscoveryProgressCallback = (message: string) => void;
