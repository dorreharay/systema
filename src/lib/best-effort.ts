/**
 * Runs a step that is nice to have done and must not stop what comes after it. A step that fails is let go (`onFail` hears of it),
 * and so is one that has not finished after `ms`: it is not cancelled, it is only no longer waited for. Never rejects, and never
 * waits longer than `ms`.
 */
export async function bestEffort(step: () => unknown, ms: number, onFail?: (error: unknown) => void): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const late = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, ms);
    });
    // `Promise.resolve().then(step)` so that a step that throws before it returns a promise is caught the same way.
    await Promise.race([Promise.resolve().then(step), late]);
  } catch (error) {
    try {
      onFail?.(error);
    } catch {
      // Whoever listens must not stop it either.
    }
  } finally {
    clearTimeout(timer);
  }
}
