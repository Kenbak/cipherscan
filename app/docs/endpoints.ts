import reference from '@/lib/generated/api-reference.json';
import anchors from './anchors.json';

export interface Schema {
  type?: string | string[];
  description?: string;
  format?: string;
  minimum?: number;
  exclusiveMinimum?: number;
  maximum?: number;
  default?: unknown;
  enum?: string[];
  required?: string[];
  properties?: Record<string, Schema>;
  items?: Schema;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}
export interface Parameter {
  name: string;
  in: string;
  required: boolean;
  description?: string;
  schema: Schema;
}
export interface ApiEndpoint {
  id: string;
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  category: string;
  description: string;
  parameters: Parameter[];
  requestBody: Schema | null;
  pagination: string | null;
  zatoshiFields: string[];
  ownershipToken: boolean;
  example: string;
}
export const categoryNames: Record<string, string> = {
  blocks: 'Blocks', transactions: 'Transactions', address: 'Addresses', mempool: 'Mempool',
  network: 'Network', 'shielded-pools': 'Shielded pools', privacy: 'Privacy', mining: 'Mining',
  crosschain: 'Cross-chain', valuation: 'Valuation', analytics: 'Analytics', stats: 'Statistics',
  migration: 'Pool migration', transparent: 'Transparent exposure', pulse: 'Network pulse',
  names: 'Names', search: 'Search', scan: 'Wallet scanning', reorgs: 'Forks & reorgs', crosslink: 'Crosslink',
};
export const categoryId = (category: string) => `category-${category}`;
export function getEndpoints(baseUrl: string): ApiEndpoint[] {
  return reference.map(route => {
    const parameters = route.parameters as Parameter[];
    const query = parameters.filter(p => p.in === 'query' && p.required).map(p => `${p.name}=<${p.name}>`);
    if (route.pagination === 'cursor') query.push('limit=25');
    const url = baseUrl.replace(/\/$/, '') + route.path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, '<$1>') + (query.length ? `?${query.join('&')}` : '');
    const headers = route.ownershipToken && route.method === 'DELETE' ? " \\\n  -H 'X-Node-Token: <ownership-token>'" : '';
    return {
      id: (anchors as Record<string, string>)[`${route.method} ${route.path}`] || `${route.method.toLowerCase()}-${route.path.slice(4).replace(/[^a-zA-Z0-9]+/g, '-')}`,
      method: route.method as ApiEndpoint['method'], path: route.path, category: route.category,
      description: route.description, parameters, requestBody: route.requestBody as Schema | null,
      pagination: route.pagination, zatoshiFields: route.zatoshiFields, ownershipToken: route.ownershipToken,
      example: `curl${route.method === 'GET' ? '' : ` -X ${route.method}`} '${url}'${headers}${route.method === 'POST' ? " \\\n  -H 'Content-Type: application/json' \\\n  --data @request.json" : ''}`,
    };
  });
}
export function getEndpointsByCategory(baseUrl: string) {
  const endpoints = getEndpoints(baseUrl);
  return Object.entries(categoryNames).map(([key, name]) => ({ key, name, endpoints: endpoints.filter(e => e.category === key) })).filter(c => c.endpoints.length);
}
export function describeSchema(schema: Schema): string {
  const parts: string[] = [];
  if (schema.description) parts.push(schema.description);
  if (schema.format) parts.push(`Format: ${schema.format}.`);
  if (schema.default !== undefined) parts.push(`Default: ${schema.default}.`);
  if (schema.minimum !== undefined) parts.push(`Minimum: ${schema.minimum}.`);
  if (schema.exclusiveMinimum !== undefined) parts.push(`Greater than ${schema.exclusiveMinimum}.`);
  if (schema.maximum !== undefined) parts.push(`Maximum: ${schema.maximum}.`);
  if (schema.enum) parts.push(`Values: ${schema.enum.join(', ')}.`);
  if (schema.minItems !== undefined) parts.push(`At least ${schema.minItems} item(s).`);
  if (schema.maxItems !== undefined) parts.push(`At most ${schema.maxItems} items.`);
  if (schema.minLength !== undefined) parts.push(`Minimum length: ${schema.minLength}.`);
  if (schema.maxLength !== undefined) parts.push(`Maximum length: ${schema.maxLength}.`);
  if (schema.pattern) parts.push(`Pattern: ${schema.pattern}`);
  return parts.join(' ');
}
