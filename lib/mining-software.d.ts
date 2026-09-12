export type MiningSoftware =
  | "zebra"
  | "zakura"
  | "other"
  | "unknown"
  | "conflicting"
  | "missing";
export const SOFTWARE_LABELS: Record<MiningSoftware, string>;
export function classifyMiningSoftware(hex?: string | null): MiningSoftware;
