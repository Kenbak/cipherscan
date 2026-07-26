export const PRIVACY_BAR_CHART_MARGIN = { top: 12, right: 16, left: 8, bottom: 32 };

export function privacyAxisLabel(fill: string, fontSize = 10) {
  return { fill, fontSize };
}

export function privacyXAxisTitle(value: string, fill: string) {
  return {
    value,
    position: 'insideBottom' as const,
    offset: 4,
    ...privacyAxisLabel(fill),
  };
}

export function privacyYAxisLabel(label: string, fill: string) {
  return {
    value: label,
    angle: -90,
    position: 'insideLeft' as const,
    ...privacyAxisLabel(fill),
  };
}
