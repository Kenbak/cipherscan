/* eslint-disable @typescript-eslint/no-require-imports */
const { z } = require('zod');
const { analysisSchema } = require('./contract');
const { pageIds } = require('./pages');
const locales = ['en', 'fr', 'es', 'de', 'pt', 'ja', 'zh', 'ko', 'ar', 'ru'];
const chatRequestSchema = z.object({
  question: z.string().trim().min(1).max(1000),
  page: z.enum(pageIds),
  context: analysisSchema.nullable(),
  locale: z.enum(['auto', ...locales]).default('auto'),
  history: z.array(z.string().trim().min(1).max(1000)).max(4).default([]),
  challenge: z.string().max(2048).optional(),
}).strict();
module.exports = { chatRequestSchema, locales };
