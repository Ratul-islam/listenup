import { env } from '@/config/env';

import { ApiError, type ErrorEnvelope } from './api-error';

interface SuccessEnvelope<T> {
  status: 'success';
  message: string;
  data: T;
}

export interface ApiResult<T> {
  message: string;
  data: T;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface RequestOptions {
  method?: Method;
  body?: unknown;
  /** Attach the access token, refreshing it once if the server rejects it */
  auth?: boolean;
  timeoutMs?: number;
}

/**
 * The auth store plugs in here so the client can read the access token and
 * trigger a refresh without importing the store (which itself uses the client).
 */
interface AuthHandlers {
  getAccessToken: () => string | null;
  refreshAccessToken: () => Promise<string | null>;
}

let authHandlers: AuthHandlers | null = null;

export function registerAuthHandlers(handlers: AuthHandlers) {
  authHandlers = handlers;
}

const TIMEOUT_MS = 15_000;

async function send<T>(
  path: string,
  { method = 'GET', body, timeoutMs = TIMEOUT_MS }: RequestOptions,
  accessToken?: string,
): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const isForm = body instanceof FormData;

  let response: Response;
  try {
    response = await fetch(`${env.apiUrl}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined && !isForm && { 'Content-Type': 'application/json' }),
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      },
      body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw ApiError.network(controller.signal.aborted);
  } finally {
    clearTimeout(timer);
  }

  const payload = (await response.json().catch(() => null)) as
    | SuccessEnvelope<T>
    | ErrorEnvelope
    | null;

  if (!response.ok || payload?.status !== 'success') {
    throw ApiError.fromResponse(response.status, payload as ErrorEnvelope | null);
  }

  return { message: payload.message, data: payload.data };
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  if (!options.auth || !authHandlers) return send<T>(path, options);

  const token = authHandlers.getAccessToken() ?? (await authHandlers.refreshAccessToken());
  if (!token) throw new ApiError('Your session has ended. Sign in again.', 401, 'UNAUTHORIZED');

  try {
    return await send<T>(path, options, token);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;

    // Access token expired or was revoked: refresh once and retry
    const freshToken = await authHandlers.refreshAccessToken();
    if (!freshToken) throw error;
    return send<T>(path, options, freshToken);
  }
}

type Options = Omit<RequestOptions, 'method' | 'body'>;

const UPLOAD_TIMEOUT_MS = 120_000;

export const api = {
  get: <T>(path: string, options?: Options) => request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Options) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: Options) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: Options) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options?: Options) => request<T>(path, { ...options, method: 'DELETE' }),
  /** multipart/form-data upload (FormData sets its own boundary header) */
  upload: <T>(path: string, form: FormData, options?: Options) =>
    request<T>(path, { timeoutMs: UPLOAD_TIMEOUT_MS, ...options, method: 'POST', body: form }),
};
