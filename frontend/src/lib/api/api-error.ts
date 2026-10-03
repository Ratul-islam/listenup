export interface ErrorEnvelope {
  status: 'error';
  message?: string;
  code?: string;
  errors?: unknown;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Request never got a response (offline, DNS, timeout) */
  get isNetworkError() {
    return this.status === 0;
  }

  static network(timedOut: boolean) {
    return timedOut
      ? new ApiError('The server took too long to respond. Try again.', 0, 'TIMEOUT')
      : new ApiError("Can't reach the server. Check your connection and try again.", 0, 'NETWORK_ERROR');
  }

  static fromResponse(status: number, body: ErrorEnvelope | null) {
    return new ApiError(
      body?.message ?? `Request failed with status ${status}`,
      status,
      body?.code,
      body?.errors,
    );
  }
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Try again.';
}

export function hasErrorCode(error: unknown, ...codes: string[]): error is ApiError {
  return error instanceof ApiError && !!error.code && codes.includes(error.code);
}
