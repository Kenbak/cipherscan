/** The deadline covers headers AND body consumption. */
export async function fetchLiveJson(url: string, timeoutMs = 15000): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

/** One polling loop, independent of socket state. Resume events cannot multiply it. */
export function startLiveRefresh(refresh: () => Promise<void>, intervalMs = 15000) {
  let stopped = false;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const hidden = () => document.visibilityState === 'hidden';
  const run = async () => {
    clear();
    if (stopped || running || hidden()) return;
    running = true;
    try {
      await refresh();
    } finally {
      running = false;
      if (!stopped && !hidden()) {
        timer = setTimeout(run, intervalMs);
      }
    }
  };
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') clear();
    else void run();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', run);
  window.addEventListener('focus', run);
  window.addEventListener('pageshow', run);
  void run();
  return () => {
    stopped = true;
    clear();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('online', run);
    window.removeEventListener('focus', run);
    window.removeEventListener('pageshow', run);
  };
}
