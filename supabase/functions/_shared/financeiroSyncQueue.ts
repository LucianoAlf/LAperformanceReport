import {
  EmusysHttpError,
  EmusysRateLimitError,
} from './faturasSync.ts';

export type FinanceiroQueueJob = {
  id: string;
  competencia: string;
  status: 'running';
  trigger_source: string;
  requested_by: string | null;
  attempt_count: number;
  max_attempts: number;
};

export type ClassifiedSyncError = {
  retryable: boolean;
  code: string;
  detail: string;
  httpStatus: number | null;
  retryAfterSeconds: number | null;
};

export const syncErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return String(error);
};

export function classifyFinanceiroSyncError(error: unknown): ClassifiedSyncError {
  const detail = syncErrorMessage(error);

  if (error instanceof EmusysRateLimitError) {
    return {
      retryable: true,
      code: error.code,
      detail,
      httpStatus: 429,
      retryAfterSeconds: Math.max(1, Math.ceil(error.retryAfterMs / 1000)),
    };
  }

  if (error instanceof EmusysHttpError) {
    return {
      retryable: error.status >= 500,
      code: `EMUSYS_HTTP_${error.status}`,
      detail,
      httpStatus: error.status,
      retryAfterSeconds: null,
    };
  }

  if (/FINANCEIRO_SYNC_MUTEX|55P03|sync financeiro running/i.test(detail)) {
    return {
      retryable: true,
      code: 'FINANCEIRO_SYNC_MUTEX',
      detail,
      httpStatus: null,
      retryAfterSeconds: 60,
    };
  }

  if (
    error instanceof TypeError
    || /fetch failed|network|connection reset|timed?\s*out|timeout/i.test(detail)
  ) {
    return {
      retryable: true,
      code: 'NETWORK_ERROR',
      detail,
      httpStatus: null,
      retryAfterSeconds: null,
    };
  }

  return {
    retryable: false,
    code: /identificador|data|competencia|cursor|pagina|tem_mais|duplicado/i.test(detail)
      ? 'SYNC_VALIDATION_ERROR'
      : 'SYNC_TERMINAL_ERROR',
    detail,
    httpStatus: null,
    retryAfterSeconds: null,
  };
}
