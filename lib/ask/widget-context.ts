import { analysisSchema, type AnalysisSpec } from './contract';

export const ASK_CHART_EVENT = 'zecblock:ask-chart';

// Only a validated recipe crosses this boundary; never page HTML or client facts.
export function openAskChart(spec: AnalysisSpec) {
  window.dispatchEvent(new CustomEvent(ASK_CHART_EVENT, {
    detail: { pathname: window.location.pathname, spec: analysisSchema.parse(spec) },
  }));
}
