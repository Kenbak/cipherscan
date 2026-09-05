/** Assay information palette. Match semantic roles in app/globals.css. */
export function getChartColors(theme: 'dark' | 'light') {
  const dark = theme === 'dark';
  const gold = dark ? '#F8BC21' : '#866008';
  const iris = dark ? '#B6A0E0' : '#75628E';
  const sage = dark ? '#91AC90' : '#587652';
  const steel = dark ? '#A1A9AD' : '#667278';
  const stone = dark ? '#7F897A' : '#64705F';
  return {
    grid: dark ? '#2C3037' : '#D7DBCF',
    axis: dark ? '#9CA4B0' : '#666D5D',
    tooltipBg: dark ? '#111316' : '#FFFFFF',
    tooltipBorder: dark ? '#2C3037' : '#D7DBCF',
    tooltipText: dark ? '#F1F3F5' : '#20221D',
    ironwood: gold,
    orchard: iris,
    sapling: sage,
    sprout: stone,
    transparent: steel,
    shielded: iris,
    coinbase: steel,
    gold,
    yellow: gold,
    purple: iris,
    orchardPool: iris,
    ironwoodPool: gold,
    verifiedRing: dark ? '#65C79A' : '#506F43',
    denominated: gold,
    distinctive: dark ? '#D58D86' : '#A74640',
    // Source identity stays consistent across composition and inflow views.
    inflowOrchard: iris,
    inflowTransparent: steel,
    inflowSapling: sage,
    inflowCoinbase: stone,
    referenceLine: dark ? '#565D68' : '#B0B7A5',
    cursor: dark ? '#9CA4B0' : '#666D5D',
    gridStroke: dark ? '#20242A' : '#E7E9E1',
    barCursor: dark ? 'rgba(248,188,33,0.08)' : 'rgba(134,96,8,0.08)',
    barCursorGold: dark ? 'rgba(248,188,33,0.08)' : 'rgba(134,96,8,0.08)',
  };
}
