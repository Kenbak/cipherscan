'use client';

import { isValidElement, type ComponentProps } from 'react';
import { Tooltip } from 'recharts';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors, getChartTooltipStyle } from '@/lib/chart-theme';

/** Shared interaction surface for every Recharts view; series colors retain their meaning. */
export function ChartTooltip({ contentStyle, labelStyle, cursor, ...props }: ComponentProps<typeof Tooltip>) {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  return <Tooltip {...props}
    cursor={cursor === false || isValidElement(cursor) ? cursor : { fill: colors.hoverFill, stroke: colors.hoverStroke, strokeWidth: 1 }}
    contentStyle={{ ...contentStyle, ...getChartTooltipStyle(colors) }}
    labelStyle={{ ...labelStyle, color: colors.tooltipText, marginBottom: 8 }}
    isAnimationActive={false}
  />;
}
