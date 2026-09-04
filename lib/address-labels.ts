/**
 * Address Labels System
 *
 * Official labels are fetched from the database via API
 * Custom labels are stored in localStorage (user's browser)
 */

import { useEffect, useState } from 'react';
import { getApiUrl } from '@/lib/api-config';

// Cache for official labels from API
let officialLabelsCache: Record<string, { label: string; description?: string; category?: string }> = {};
let labelsCacheExpiry = 0;
let labelsRetryAfter = 0;
let officialLabelsRequest: Promise<Record<string, { label: string; description?: string; category?: string }>> | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const FAILURE_BACKOFF = 30 * 1000;
const REQUEST_TIMEOUT = 8 * 1000;

/**
 * Fetch official labels from the API
 */
export async function fetchOfficialLabels(): Promise<Record<string, { label: string; description?: string; category?: string }>> {
  const now = Date.now();
  // Return cache if still valid
  if (now < labelsCacheExpiry) {
    return officialLabelsCache;
  }
  if (now < labelsRetryAfter) return officialLabelsCache;
  if (officialLabelsRequest) return officialLabelsRequest;

  officialLabelsRequest = (async () => {
    const apiUrl = getApiUrl();
    try {
      const response = await fetch(`${apiUrl}/api/labels`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });

      if (!response.ok) {
        labelsRetryAfter = Date.now() + FAILURE_BACKOFF;
        console.warn(`Official labels temporarily unavailable (HTTP ${response.status})`);
        return officialLabelsCache;
      }

      const data = await response.json();

      // Convert array to Record
      officialLabelsCache = {};
      for (const item of data.labels || []) {
        officialLabelsCache[item.address] = {
          label: item.label,
          description: item.description,
          category: item.category,
        };
      }

      labelsCacheExpiry = Date.now() + CACHE_DURATION;
      labelsRetryAfter = 0;
      return officialLabelsCache;
    } catch {
      labelsRetryAfter = Date.now() + FAILURE_BACKOFF;
      console.warn('Official labels temporarily unavailable');
      return officialLabelsCache;
    } finally {
      officialLabelsRequest = null;
    }
  })();

  return officialLabelsRequest;
}

/**
 * Get cached official labels (synchronous, returns what's in cache)
 */
export function getOfficialLabels(): Record<string, { label: string; description?: string; category?: string }> {
  return officialLabelsCache;
}

export function __resetOfficialLabelsForTests(): void {
  officialLabelsCache = {};
  labelsCacheExpiry = 0;
  labelsRetryAfter = 0;
  officialLabelsRequest = null;
}

// localStorage key for custom labels
const CUSTOM_LABELS_KEY = 'zcash-explorer-address-labels';

/**
 * Get custom labels from localStorage
 */
export function getCustomLabels(): Record<string, string> {
  if (typeof window === 'undefined') return {};

  try {
    const stored = localStorage.getItem(CUSTOM_LABELS_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

/**
 * Save a custom label for an address
 */
export function setCustomLabel(address: string, label: string): void {
  if (typeof window === 'undefined') return;

  const labels = getCustomLabels();

  if (label.trim() === '') {
    // Remove label if empty
    delete labels[address];
  } else {
    labels[address] = label.trim();
  }

  localStorage.setItem(CUSTOM_LABELS_KEY, JSON.stringify(labels));
}

/**
 * Remove a custom label
 */
export function removeCustomLabel(address: string): void {
  setCustomLabel(address, '');
}

/**
 * Get label for an address (checks official first, then custom)
 */
export function getAddressLabel(address: string): { label: string; isOfficial: boolean; description?: string; category?: string } | null {
  // Check official labels first (from cache)
  const official = officialLabelsCache[address];
  if (official) {
    return {
      label: official.label,
      isOfficial: true,
      description: official.description,
      category: official.category,
    };
  }

  // Check custom labels
  const customLabels = getCustomLabels();
  const customLabel = customLabels[address];
  if (customLabel) {
    return {
      label: customLabel,
      isOfficial: false,
    };
  }

  return null;
}

export type AddressLabelInfo = {
  label: string;
  isOfficial: boolean;
  description?: string;
  category?: string;
};

/**
 * Shared hook for looking up an address's label — fetches the official
 * label set once (cached module-wide) and resolves official-or-custom for
 * this address. Every component that needs "is this a known entity?" (flow
 * diagram nodes, prose mentions, tables) should use this instead of
 * duplicating the fetch-then-lookup effect.
 */
export function useAddressLabel(address: string): AddressLabelInfo | null {
  const [labelInfo, setLabelInfo] = useState<AddressLabelInfo | null>(() => getAddressLabel(address));

  useEffect(() => {
    let cancelled = false;
    setLabelInfo(getAddressLabel(address));
    fetchOfficialLabels().then(() => {
      if (!cancelled) setLabelInfo(getAddressLabel(address));
    });
    return () => {
      cancelled = true;
    };
  }, [address]);

  return labelInfo;
}

/**
 * Get all custom labels (for export/display)
 */
export function getAllCustomLabels(): Array<{ address: string; label: string }> {
  const labels = getCustomLabels();
  return Object.entries(labels).map(([address, label]) => ({ address, label }));
}

/**
 * Search for an address by its label (case-insensitive, partial match)
 * Returns the first matching address or null
 */
export function findAddressByLabel(searchQuery: string): string | null {
  const normalizedQuery = searchQuery.toLowerCase().trim();

  if (!normalizedQuery) return null;

  // Search in official labels first
  for (const [address, info] of Object.entries(officialLabelsCache)) {
    if (info.label.toLowerCase().includes(normalizedQuery)) {
      return address;
    }
    if (info.description?.toLowerCase().includes(normalizedQuery)) {
      return address;
    }
  }

  // Search in custom labels
  const customLabels = getCustomLabels();
  for (const [address, label] of Object.entries(customLabels)) {
    if (label.toLowerCase().includes(normalizedQuery)) {
      return address;
    }
  }

  return null;
}

/**
 * Get all addresses matching a label search (for autocomplete)
 */
export function searchAddressesByLabel(searchQuery: string): Array<{ address: string; label: string; isOfficial: boolean; category?: string }> {
  const normalizedQuery = searchQuery.toLowerCase().trim();
  const results: Array<{ address: string; label: string; isOfficial: boolean; category?: string }> = [];

  if (!normalizedQuery) return results;

  // Search in official labels
  for (const [address, info] of Object.entries(officialLabelsCache)) {
    if (info.label.toLowerCase().includes(normalizedQuery) ||
        info.description?.toLowerCase().includes(normalizedQuery)) {
      results.push({ address, label: info.label, isOfficial: true, category: info.category });
    }
  }

  // Search in custom labels
  const customLabels = getCustomLabels();
  for (const [address, label] of Object.entries(customLabels)) {
    if (label.toLowerCase().includes(normalizedQuery)) {
      results.push({ address, label, isOfficial: false, category: 'Custom' });
    }
  }

  return results;
}
