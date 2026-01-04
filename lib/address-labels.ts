/**
 * Address Labels System
 *
 * Known addresses are hardcoded (official Zcash addresses)
 * Custom labels are stored in localStorage (user's browser)
 */

// Known addresses with official labels
export const KNOWN_ADDRESSES: Record<string, { label: string; description?: string; type?: 'foundation' | 'exchange' | 'mining' | 'other' }> = {
  // Zcash Foundation / Lockbox
  't3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo': {
    label: 'Coinholder Fund Lockbox',
    description: 'Zcash Community Grants funding lockbox',
    type: 'foundation',
  },

  // Add more known addresses here as needed
  // Examples:
  // 't3XyYW8yBFRuMnfvm5KLGFbEVz25kckZXym': {
  //   label: 'Zcash Foundation',
  //   type: 'foundation',
  // },
};

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
 * Get label for an address (checks known first, then custom)
 */
export function getAddressLabel(address: string): { label: string; isKnown: boolean; description?: string; type?: string } | null {
  // Check known addresses first
  const known = KNOWN_ADDRESSES[address];
  if (known) {
    return {
      label: known.label,
      isKnown: true,
      description: known.description,
      type: known.type,
    };
  }

  // Check custom labels
  const customLabels = getCustomLabels();
  const customLabel = customLabels[address];
  if (customLabel) {
    return {
      label: customLabel,
      isKnown: false,
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
