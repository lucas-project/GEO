'use client';

import { Loader2, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { canonicalPageUrl } from '@/lib/website-url';
import type { AuditPageEntry } from '@modules/geo-audit';

const SOURCE_LABELS = {
  seed: 'Homepage',
  sitemap: 'Sitemap',
  internal: 'Internal link',
} as const;

export interface DiscoverResult {
  url: string;
  pages: AuditPageEntry[];
  suggestedUrls: string[];
  maxSelectable: number;
}

interface AuditPagePickerProps {
  siteUrl: string;
  /** Discovery result from parent (required to show the list). */
  discovery: DiscoverResult;
  selected: Set<string>;
  onSelectedChange: (next: Set<string>) => void;
  disabled?: boolean;
  /** Primary action below the list */
  onStart?: () => void;
  startLabel?: string;
  startLoading?: boolean;
  /** When false (e.g. “audit more pages”), homepage is not forced. */
  lockHomepage?: boolean;
}

export function pageSelectionKey(url: string, siteRoot: string): string {
  return canonicalPageUrl(url, siteRoot);
}

/** Homepage is always selected and cannot be unchecked. */
export function defaultHomepageSelection(discovery: DiscoverResult): Set<string> {
  const root = discovery.suggestedUrls[0] ?? discovery.url;
  return new Set([pageSelectionKey(root, discovery.url)]);
}

export function countSelectedPages(
  pages: AuditPageEntry[],
  selected: Set<string>,
  siteRoot: string,
): number {
  let n = 0;
  for (const p of pages) {
    if (selected.has(pageSelectionKey(p.url, siteRoot))) n++;
  }
  return n;
}

export function selectedPageUrls(
  pages: AuditPageEntry[],
  selected: Set<string>,
  siteRoot: string,
): string[] {
  return pages
    .filter((p) => selected.has(pageSelectionKey(p.url, siteRoot)))
    .map((p) => pageSelectionKey(p.url, siteRoot));
}

export function AuditPagePicker({
  siteUrl,
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
  const pageKeys = discovery.pages.map((p) => pageSelectionKey(p.url, siteRoot));
  const selectableKeys = lockHomepage
    ? pageKeys.filter((k) => k !== homepageKey)
    : pageKeys;
  const selectedCount = countSelectedPages(discovery.pages, selected, siteRoot);
  const allSelectableCount = Math.min(selectableKeys.length, discovery.maxSelectable - (lockHomepage ? 1 : 0));
  const optionalSelectedCount = selectableKeys.filter((k) => selected.has(k)).length;
  const allSelected =
    selectableKeys.length > 0 &&
    optionalSelectedCount >= Math.min(selectableKeys.length, allSelectableCount);
  const someSelected = optionalSelectedCount > 0 && !allSelected;

  const toggle = (pageUrl: string) => {
    const key = pageSelectionKey(pageUrl, siteRoot);
    if (lockHomepage && key === homepageKey) return;

    const next = new Set(selected);
    if (next.has(key)) {
      next.delete(key);
    } else if (next.size < discovery.maxSelectable) {
      next.add(key);
    }
    if (lockHomepage && !next.has(homepageKey)) next.add(homepageKey);
    onSelectedChange(next);
  };

  const selectAll = () => {
    const next = new Set<string>(lockHomepage ? [homepageKey] : []);
    for (const p of discovery.pages) {
      if (next.size >= discovery.maxSelectable) break;
      next.add(pageSelectionKey(p.url, siteRoot));
    }
    onSelectedChange(next);
  };

  const clearExtra = () => {
    onSelectedChange(lockHomepage ? new Set([homepageKey]) : new Set());
  };

  const toggleSelectAll = () => {
    if (allSelected) clearExtra();
    else selectAll();
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="px-3 py-2 bg-bg-elevated border-b border-border flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="text-xs font-medium text-fg">
              {selectedCount} page{selectedCount !== 1 ? 's' : ''} selected
              {discovery.maxSelectable < discovery.pages.length && (
                <span className="text-fg-muted font-normal"> (max {discovery.maxSelectable})</span>
              )}
            </p>
            <p className="text-[12px] text-fg-muted mt-0.5">
              {lockHomepage
                ? 'Homepage is always included. Pick any other pages to audit.'
                : 'Tick the pages you want to add to this audit.'}
            </p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-[13px] px-2"
              disabled={disabled || selectableKeys.length === 0}
              onClick={selectAll}
            >
              Select all
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
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected;
              }}
              disabled={disabled}
              onChange={toggleSelectAll}
            />
            <span className="text-fg-muted">
              {allSelected ? 'Deselect all' : 'Select all'} ({selectableKeys.length} page
              {selectableKeys.length !== 1 ? 's' : ''})
            </span>
          </label>
        )}
        <ul className="max-h-56 overflow-y-auto divide-y divide-border-subtle">
          {discovery.pages.map((page) => {
            const key = pageSelectionKey(page.url, siteRoot);
            const isHome = lockHomepage && key === homepageKey;
            const checked = selected.has(key);
            return (
              <li key={key} className="flex items-start gap-2 px-3 py-2 text-xs">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={checked}
                  disabled={isHome || disabled}
                  onChange={() => toggle(page.url)}
                />
                <div className="flex-1 min-w-0">
                  <p className="break-all text-fg">{page.url}</p>
                  {page.title ? <p className="text-fg-muted truncate">{page.title}</p> : null}
                  {isHome && (
                    <p className="text-[12px] text-fg-subtle mt-0.5">Required · homepage</p>
                  )}
                </div>
                <Badge variant="default" className="shrink-0">
                  {SOURCE_LABELS[page.source]}
                </Badge>
              </li>
            );
          })}
        </ul>
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

/** Imperative discover for parent-controlled flows */
export async function discoverSitePages(siteUrl: string): Promise<DiscoverResult> {
  return api.post<DiscoverResult>('/api/geo-audit/discover', { url: siteUrl.trim() });
}
