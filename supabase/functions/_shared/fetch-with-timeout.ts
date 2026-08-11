export async function runWithTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeoutError = new Error(`Tempo limite excedido (${timeoutMs}ms)`);

  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(timeoutError);
      }, timeoutMs);
    });
    const operationResult = operation(controller.signal).catch((error) => {
      if (timedOut) throw timeoutError;
      throw error;
    });

    return await Promise.race([operationResult, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
