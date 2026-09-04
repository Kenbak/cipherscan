'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');
const { performance } = require('node:perf_hooks');

const requestTimingStorage = new AsyncLocalStorage();

function runWithRequestTimings(callback) {
  return requestTimingStorage.run(new Map(), callback);
}

async function measureRequestTiming(name, operation) {
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    addRequestTiming(name, performance.now() - startedAt);
  }
}

function addRequestTiming(name, durationMs) {
  const timings = requestTimingStorage.getStore();
  if (!timings || !Number.isFinite(durationMs) || durationMs < 0) return;
  const safeName = String(name).replace(/[^a-zA-Z0-9_-]/g, '_') || 'work';
  timings.set(safeName, (timings.get(safeName) || 0) + durationMs);
}

function formatRequestTimings() {
  const timings = requestTimingStorage.getStore();
  if (!timings) return '';
  return Array.from(timings.entries())
    .map(([name, durationMs]) => `${name};dur=${durationMs.toFixed(1)}`)
    .join(', ');
}

module.exports = {
  addRequestTiming,
  formatRequestTimings,
  measureRequestTiming,
  runWithRequestTimings,
};

