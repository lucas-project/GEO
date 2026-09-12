'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Loader2, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { GEO_PRIORITY_HINT, GeoPriorityBadge } from '@/components/geo/geo-priority-badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { AuditPageEntry, PageArchetype } from '@modules/geo-audit';
import {
  defaultExpandedArchetypes,
  groupPagesByArchetype,
  groupSelectionState,
  type PageArchetypeGroup,
} from './group-pages-by-archetype';
import {
  countSelectedPages,
  pageSelectionKey,
  selectedPageUrls,
} from './page-selection';

const SOURCE_LABELS: Record<AuditPageEntry['source'], string> = {
  seed: 'Homepage',
  sitemap: 'Sitemap',
  internal: 'Nav link',
  llms: 'llms.txt',
  graph: 'Link graph',
};

export interface DiscoverResult {
  url: string;
  pages: AuditPageEntry[];
  suggestedUrls: string[];
  maxSelectable: number;
  discoveredCount: number;
  probedCount: number;
}

interface AuditPagePickerProps {
  siteUrl: string;
  discovery: DiscoverResult;
  selected: Set<string>;
  onSelectedChange: (next: Set<string>) => void;
  disabled?: boolean;
  onStart?: () => void;
  startLabel?: string;
  startLoading?: boolean;
  lockHomepage?: boolean;
}

export { pageSelectionKey, countSelectedPages, selectedPageUrls };

export function defaultGeoSelection(discovery: DiscoverResult): Set<string> {
  return new Set(discovery.suggestedUrls.map((u) => pageSelectionKey(u, discovery.url)));
}

export function defaultHomepageSelection(discovery: DiscoverResult): Set<string> {
  return defaultGeoSelection(discovery);
}

function CategorySection({
  group,
  siteRoot,
  homepageKey,
  lockHomepage,
  selected,
  disabled,
  expanded,
  onToggleExpand,
  onTogglePage,
  onToggleCategory,
}: {
  group: PageArchetypeGroup;
  siteRoot: string;
  homepageKey: string;
  lockHomepage: boolean;
  selected: Set<string>;
  disabled?: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onTogglePage: (url: string) => void;
  onToggleCategory: () => void;
}) {
  const { allSelected, someSelected, selectableKeys } = groupSelectionState(
    group,
    selected,
    siteRoot,
    homepageKey,
    lockHomepage,
  );
  const selectedInGroup = group.pages.filter((p) =>
    selected.has(pageSelectionKey(p.url, siteRoot)),
  ).length;

  return (
    <div className="border-b border-border-subtle last:border-b-0">
      <div className="flex items-center gap-2 px-3 py-2 bg-bg-subtle/40 hover:bg-bg-subtle/70 transition-colors">
        {selectableKeys.length > 0 ? (
          <input
            type="checkbox"
            className="shrink-0"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            disabled={disabled}
            onChange={onToggleCategory}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select all ${group.label} pages`}
          />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <button
          type="button"
          className="flex flex-1 items-center gap-2 min-w-0 text-left"
          onClick={onToggleExpand}
          aria-expanded={expanded}
        >
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-fg-muted transition-transform',
              expanded && 'rotate-180',
            )}
          />
          <span className="text-xs font-medium text-fg truncate">{group.label}</span>
          <span className="text-[11px] text-fg-muted shrink-0">
            {selectedInGroup}/{group.pages.length}
          </span>
        </button>
      </div>
      {expanded && (
        <ul className="divide-y divide-border-subtle/80">
          {group.pages.map((page) => {
            const key = pageSelectionKey(page.url, siteRoot);
            const isHome = lockHomepage && key === homepageKey;
            return (
              <li key={key} className="flex items-start gap-2 px-3 py-2 pl-9 text-xs">
                <input
                  type="checkbox"
                  className="mt-0.5 shrink-0"
                  checked={selected.has(key)}
                  disabled={isHome || disabled}
                  onChange={() => onTogglePage(page.url)}
                />
                <div className="flex-1 min-w-0">
                  <p className="break-all text-fg">{page.url}</p>
                  {page.title ? <p className="text-fg-muted truncate">{page.title}</p> : null}
                  {page.signals && page.signals.length > 0 && (
                    <p
                      className="text-[11px] text-fg-subtle mt-0.5 line-clamp-2"
                      title={page.signals.join(' · ')}
                    >
                      {page.signals.slice(0, 2).join(' · ')}
                    </p>
                  )}
                  {isHome && (
                    <p className="text-[12px] text-fg-subtle mt-0.5">Required · homepage</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {page.geoScore != null && page.geoScore > 0 && (
                    <GeoPriorityBadge score={page.geoScore} probed={page.probed} />
                  )}
                  <Badge variant="default" className="text-[10px] px-1.5">
                    {SOURCE_LABELS[page.source]}
                  </Badge>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function AuditPagePicker({
  discovery,
  selected,
  onSelectedChange,
  disabled,
  onStart,
  startLabel,
  startLoading,
  lockHomepage = true,
}: AuditPagePickerProps) {
  const siteRoot = discovery.url;
  const homepageKey = pageSelectionKey(discovery.suggestedUrls[0] ?? discovery.url, siteRoot);
  const groups = useMemo(
    () => groupPagesByArchetype(discovery.pages, siteRoot),
    [discovery.pages, siteRoot],
  );
  const [expanded, setExpanded] = useState<Set<PageArchetype>>(() =>
    defaultExpandedArchetypes(groups),
  );

  const selectedCount = countSelectedPages(discovery.pages, selected, siteRoot);
  const discoveredCount = discovery.discoveredCount ?? discovery.pages.length;
  const probedCount = discovery.probedCount ?? discovery.pages.filter((p) => p.probed).length;

  const allPageKeys = discovery.pages.map((p) => pageSelectionKey(p.url, siteRoot));
  const selectableKeys = lockHomepage
    ? allPageKeys.filter((k) => k !== homepageKey)
    : allPageKeys;
  const optionalSelectedCount = selectableKeys.filter((k) => selected.has(k)).length;
  const allSelectableCount = Math.min(
    selectableKeys.length,
    discovery.maxSelectable - (lockHomepage ? 1 : 0),
  );
  const allTopSelected =
    selectableKeys.length > 0 &&
    optionalSelectedCount >= Math.min(selectableKeys.length, allSelectableCount);
  const someTopSelected = optionalSelectedCount > 0 && !allTopSelected;

  const toggle = (pageUrl: string) => {
    const key = pageSelectionKey(pageUrl, siteRoot);
    if (lockHomepage && key === homepageKey) return;
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else if (next.size < discovery.maxSelectable) next.add(key);
    if (lockHomepage && !next.has(homepageKey)) next.add(homepageKey);
    onSelectedChange(next);
  };

  const addKeysUpToCap = (next: Set<string>, keys: string[]) => {
    for (const k of keys) {
      if (next.size >= discovery.maxSelectable) break;
      next.add(k);
    }
  };

  const selectTopGeo = () => {
    onSelectedChange(
      new Set(discovery.suggestedUrls.map((u) => pageSelectionKey(u, siteRoot))),
    );
  };

  const clearExtra = () => {
    onSelectedChange(lockHomepage ? new Set([homepageKey]) : new Set());
  };

  const toggleCategory = (group: PageArchetypeGroup) => {
    const { allSelected: catAll, selectableKeys: keys } = groupSelectionState(
      group,
      selected,
      siteRoot,
      homepageKey,
      lockHomepage,
    );
    const next = new Set(selected);
    if (lockHomepage) next.add(homepageKey);
    if (catAll) {
      for (const k of keys) next.delete(k);
    } else {
      addKeysUpToCap(next, keys);
    }
    onSelectedChange(next);
  };

  const toggleExpand = (archetype: PageArchetype) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(archetype)) next.delete(archetype);
      else next.add(archetype);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="px-3 py-2 bg-bg-elevated border-b border-border flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="text-xs font-medium text-fg">
              {discoveredCount} page{discoveredCount !== 1 ? 's' : ''} found
              {probedCount > 0 && (
                <span className="text-fg-muted font-normal">
                  {' '}
                  · {probedCount} ranked for audit priority
                </span>
              )}
            </p>
            <p className="text-xs font-medium text-fg mt-1">
              {selectedCount} selected
              {discovery.maxSelectable < discoveredCount && (
                <span className="text-fg-muted font-normal">
                  {' '}
                  (max {discovery.maxSelectable} to audit)
                </span>
              )}
            </p>
            <p className="text-[12px] text-fg-muted mt-0.5" title={GEO_PRIORITY_HINT}>
              Grouped by page type. GEO priority recommends which pages to audit — not your final
              audit score.
            </p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-[13px] px-2"
              disabled={disabled || selectableKeys.length === 0}
              onClick={selectTopGeo}
            >
              Top priority
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-[13px] px-2"
              disabled={disabled || selectedCount === (lockHomepage ? 1 : 0)}
              onClick={clearExtra}
            >
              {lockHomepage ? 'Homepage only' : 'Clear'}
            </Button>
          </div>
        </div>
        {selectableKeys.length > 0 && (
          <label className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle bg-bg-subtle/50 text-xs cursor-pointer hover:bg-bg-subtle">
            <input
              type="checkbox"
              className="shrink-0"
              checked={allTopSelected}
              ref={(el) => {
                if (el) el.indeterminate = someTopSelected;
              }}
              disabled={disabled}
              onChange={() => (allTopSelected ? clearExtra() : selectTopGeo())}
            />
            <span className="text-fg-muted">
              {allTopSelected ? 'Deselect extras' : 'Select top priority'}
            </span>
          </label>
        )}
        <div className="max-h-[28rem] overflow-y-auto">
          {groups.map((group) => (
            <CategorySection
              key={group.archetype}
              group={group}
              siteRoot={siteRoot}
              homepageKey={homepageKey}
              lockHomepage={lockHomepage}
              selected={selected}
              disabled={disabled}
              expanded={expanded.has(group.archetype)}
              onToggleExpand={() => toggleExpand(group.archetype)}
              onTogglePage={toggle}
              onToggleCategory={() => toggleCategory(group)}
            />
          ))}
        </div>
      </div>
      {onStart && (
        <Button
          type="button"
          className="w-full sm:w-auto"
          disabled={disabled || startLoading || selectedCount === 0}
          onClick={onStart}
        >
          {startLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Starting audit…
            </>
          ) : (
            <>
              {startLabel ?? `Start audit · ${selectedCount} page${selectedCount !== 1 ? 's' : ''}`}
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </Button>
      )}
    </div>
  );
}

export async function discoverSitePages(siteUrl: string): Promise<DiscoverResult> {
  return api.post<DiscoverResult>('/api/geo-audit/discover', { url: siteUrl.trim() });
}
