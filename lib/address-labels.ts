/**
 * Address Labels System
 *
 * Official labels are fetched from the database via API
 * Custom labels are stored in localStorage (user's browser)
 */

// Cache for official labels from API
let officialLabelsCache: Record<string, { label: string; description?: string; category?: string }> = {};
let labelsCacheExpiry = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch official labels from the API
 */
export async function fetchOfficialLabels(): Promise<Record<string, { label: string; description?: string; category?: string }>> {
  // Return cache if still valid
  if (Date.now() < labelsCacheExpiry && Object.keys(officialLabelsCache).length > 0) {
    return officialLabelsCache;
  }

  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.mainnet.cipherscan.app';
    const response = await fetch(`${apiUrl}/api/labels`);

    if (!response.ok) {
      console.warn('Failed to fetch official labels');
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
    return officialLabelsCache;
  } catch (error) {
    console.warn('Error fetching official labels:', error);
    return officialLabelsCache;
  }
}

/**
 * Get cached official labels (synchronous, returns what's in cache)
 */
export function getOfficialLabels(): Record<string, { label: string; description?: string; category?: string }> {
  return officialLabelsCache;
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
