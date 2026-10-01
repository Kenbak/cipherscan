/** Stable privacy identities. Aggregate shielded and Ironwood are a gold family,
 * not interchangeable data series. Match CSS role tokens in globals.css. */
export const PRIVACY_PALETTE = {
  dark: { shielded: '#F8BC21', shieldedInk: '#F8BC21', ironwood: '#E8CF78', ironwoodInk: '#E8CF78' },
  light: { shielded: '#DB9E00', shieldedInk: '#876000', ironwood: '#BA8A1A', ironwoodInk: '#805D10' },
} as const;

export function getPrivacyColors(theme: 'dark' | 'light') {
  return PRIVACY_PALETTE[theme];
}
