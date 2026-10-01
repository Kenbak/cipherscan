import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/**
 * Home-screen tile: the gold block sitting on the app's canvas, not a
 * full-bleed gold rectangle. iOS composites transparency unpredictably and
 * applies its own corner radius, so the tile is opaque and square-cornered.
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0B0C0E',
        }}
      >
        <div style={{ width: '44%', height: '44%', background: '#F8BC21' }} />
      </div>
    ),
    size,
  );
}
