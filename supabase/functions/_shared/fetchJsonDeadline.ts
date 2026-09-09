export interface FetchJsonDeadlineResult {
  ok: boolean;
  status: number;
  payload: unknown;
}

interface FetchJsonDeadlineOptions {
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  sleepImpl?: (milliseconds: number) => Promise<void>;
}

const timeoutError = () => new Error("Tempo limite da requisicao JSON excedido.");

async function sleepWithSignal(
  milliseconds: number,
  signal: AbortSignal,
  sleepImpl: (milliseconds: number) => Promise<void>,
): Promise<void> {
  if (signal.aborted) throw timeoutError();
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(timeoutError());
    signal.addEventListener("abort", onAbort, { once: true });
  });

  try {
    await Promise.race([sleepImpl(milliseconds), aborted]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

export async function fetchJsonWithDeadline(
  input: string | URL | Request,
  init: RequestInit,
  options: FetchJsonDeadlineOptions = {},
): Promise<FetchJsonDeadlineResult> {
  const timeoutMs = options.timeoutMs ?? 12_000;
  const maxRetries = options.maxRetries ?? 2;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepImpl = options.sleepImpl
    ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const controller = new AbortController();
  const externalSignal = init.signal;
  const onExternalAbort = () => controller.abort(externalSignal?.reason);

  if (externalSignal?.aborted) onExternalAbort();
  else externalSignal?.addEventListener("abort", onExternalAbort, { once: true });

  const startedAt = Date.now();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      if (controller.signal.aborted) throw timeoutError();

      let response: Response;
      try {
        response = await fetchImpl(input, { ...init, signal: controller.signal });
      } catch (error) {
        if (controller.signal.aborted) throw timeoutError();
        throw error;
      }

      if (response.status === 429 && attempt < maxRetries) {
        try {
          await response.body?.cancel();
        } catch {
          // O corpo do 429 nao participa do resultado; o mesmo prazo segue ativo.
        }
        const remainingMs = timeoutMs - (Date.now() - startedAt);
        const retryDelayMs = Math.min(600 * (2 ** attempt), remainingMs);
        if (retryDelayMs <= 0) throw timeoutError();
        await sleepWithSignal(retryDelayMs, controller.signal, sleepImpl);
        continue;
      }

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch (error) {
        if (controller.signal.aborted) throw timeoutError();
        if (response.ok) throw error;
      }

      return { ok: response.ok, status: response.status, payload };
    }
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }

  throw timeoutError();
}
