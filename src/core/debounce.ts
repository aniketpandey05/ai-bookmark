/** Trailing debounce that still fires at least every `maxWaitMs` while calls keep coming. */
export function debounce(fn: () => void, waitMs: number, maxWaitMs = Infinity) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let firstCallAt: number | null = null;

  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    firstCallAt = null;
  };
  const run = () => {
    cancel();
    fn();
  };
  const debounced = () => {
    const now = Date.now();
    firstCallAt ??= now;
    clearTimeout(timer);
    if (now - firstCallAt >= maxWaitMs) run();
    else timer = setTimeout(run, waitMs);
  };
  debounced.cancel = cancel;
  return debounced;
}
