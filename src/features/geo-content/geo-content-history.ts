'use client';

import { useCallback, useEffect, useState } from 'react';
import type { GeoContentKeyword, GeoContentPack } from '@modules/geo-content';

const STORAGE_KEY = 'geo_content_history_v1';
const MAX_ENTRIES = 40;

export interface GeoContentHistoryEntry {
  id: string;
  createdAt: string;
  url: string;
  auditId: string;
  keywords: GeoContentKeyword[];
  pack: GeoContentPack;
}

function readHistory(): GeoContentHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry);
  } catch {
    return [];
  }
}

function isValidEntry(v: unknown): v is GeoContentHistoryEntry {
  if (!v || typeof v !== 'object') return false;
  const e = v as Partial<GeoContentHistoryEntry>;
  return (
    typeof e.id === 'string' &&
    typeof e.createdAt === 'string' &&
    typeof e.url === 'string' &&
    typeof e.auditId === 'string' &&
    Array.isArray(e.keywords) &&
    e.pack != null &&
    typeof e.pack === 'object'
  );
}

function writeHistory(entries: GeoContentHistoryEntry[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

export function useGeoContentHistory() {
  const [entries, setEntries] = useState<GeoContentHistoryEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setEntries(readHistory());
    setHydrated(true);
  }, []);

  const persist = useCallback((next: GeoContentHistoryEntry[]) => {
    setEntries(next);
    writeHistory(next);
  }, []);

  const addEntry = useCallback(
    (input: Omit<GeoContentHistoryEntry, 'id' | 'createdAt'>) => {
      const entry: GeoContentHistoryEntry = {
        ...input,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };
      const prev = readHistory();
      const withoutDup = prev.filter(
        (e) => !(e.auditId === entry.auditId && e.pack.inferredTopic === entry.pack.inferredTopic),
      );
      persist([entry, ...withoutDup].slice(0, MAX_ENTRIES));
      return entry;
    },
    [persist],
  );

  const removeEntry = useCallback(
    (id: string) => {
      persist(entries.filter((e) => e.id !== id));
    },
    [entries, persist],
  );

  const clearHistory = useCallback(() => {
    persist([]);
  }, [persist]);

  return { entries, hydrated, addEntry, removeEntry, clearHistory };
}
