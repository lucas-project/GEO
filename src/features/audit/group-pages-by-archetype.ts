import type { AuditPageEntry, PageArchetype } from '@modules/geo-audit';
import { ARCHETYPE_DISPLAY_ORDER, ARCHETYPE_LABELS } from '@modules/geo-audit';
import { pageSelectionKey } from './page-selection';

export interface PageArchetypeGroup {
  archetype: PageArchetype;
  label: string;
  pages: AuditPageEntry[];
}

function normalizePathname(url: string): string {
  try {
    const p = new URL(url).pathname.replace(/\/$/, '');
    return p || '/';
  } catch {
    return '/';
  }
}

function pathSegmentCount(pathname: string): number {
  if (pathname === '/') return 0;
  return pathname.split('/').filter(Boolean).length;
}

/** True when this path is a parent of another page in the same category. */
function isSectionHub(pathname: string, allPathnames: string[]): boolean {
  return allPathnames.some(
    (other) => other !== pathname && other.startsWith(`${pathname}/`),
  );
}

/**
 * Within a category: section roots first (e.g. /product before /product/foo),
 * then shallower paths, then GEO score.
 */
export function sortPagesInCategory(pages: AuditPageEntry[]): AuditPageEntry[] {
  const pathnames = pages.map((p) => normalizePathname(p.url));

  return [...pages].sort((a, b) => {
    const pathA = normalizePathname(a.url);
    const pathB = normalizePathname(b.url);
    const depthA = pathSegmentCount(pathA);
    const depthB = pathSegmentCount(pathB);
    if (depthA !== depthB) return depthA - depthB;

    const hubA = isSectionHub(pathA, pathnames);
    const hubB = isSectionHub(pathB, pathnames);
    if (hubA !== hubB) return hubA ? -1 : 1;

    const scoreDiff = (b.geoScore ?? 0) - (a.geoScore ?? 0);
    if (scoreDiff !== 0) return scoreDiff;

    return pathA.localeCompare(pathB);
  });
}

/** Group discovered pages by GEO archetype, roots first within each group. */
export function groupPagesByArchetype(
  pages: AuditPageEntry[],
  siteRoot: string,
): PageArchetypeGroup[] {
  const byArchetype = new Map<PageArchetype, AuditPageEntry[]>();

  for (const page of pages) {
    const archetype = page.archetype ?? 'content';
    const list = byArchetype.get(archetype) ?? [];
    list.push(page);
    byArchetype.set(archetype, list);
  }

  const groups: PageArchetypeGroup[] = [];
  for (const archetype of ARCHETYPE_DISPLAY_ORDER) {
    const list = byArchetype.get(archetype);
    if (!list?.length) continue;
    groups.push({
      archetype,
      label: ARCHETYPE_LABELS[archetype],
      pages: sortPagesInCategory(list),
    });
  }

  return groups;
}

export function defaultExpandedArchetypes(groups: PageArchetypeGroup[]): Set<PageArchetype> {
  const expanded = new Set<PageArchetype>([
    'homepage',
    'product',
    'faq',
    'qa',
    'glossary',
    'comparison',
    'documentation',
  ]);
  for (const g of groups) {
    if (g.archetype === 'utility' || g.archetype === 'blog') expanded.delete(g.archetype);
  }
  return expanded;
}

export function groupSelectionState(
  group: PageArchetypeGroup,
  selected: Set<string>,
  siteRoot: string,
  homepageKey: string,
  lockHomepage: boolean,
): { allSelected: boolean; someSelected: boolean; selectableKeys: string[] } {
  const selectableKeys = group.pages
    .map((p) => pageSelectionKey(p.url, siteRoot))
    .filter((k) => !(lockHomepage && k === homepageKey));

  if (selectableKeys.length === 0) {
    return { allSelected: true, someSelected: false, selectableKeys };
  }

  const selectedInGroup = selectableKeys.filter((k) => selected.has(k)).length;
  return {
    selectableKeys,
    allSelected: selectedInGroup === selectableKeys.length,
    someSelected: selectedInGroup > 0 && selectedInGroup < selectableKeys.length,
  };
}
