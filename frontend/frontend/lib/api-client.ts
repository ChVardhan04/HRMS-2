'use client';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api/v1';

function getTokens() {
  if (typeof window === 'undefined') return { accessToken: null, refreshToken: null };
  return {
    accessToken: localStorage.getItem('hrms_access_token'),
    refreshToken: localStorage.getItem('hrms_refresh_token'),
  };
}

function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem('hrms_access_token', accessToken);
  localStorage.setItem('hrms_refresh_token', refreshToken);
}

export function clearTokens() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('hrms_access_token');
  localStorage.removeItem('hrms_refresh_token');
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const { refreshToken } = getTokens();
    if (!refreshToken) return null;
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      clearTokens();
      return null;
    }
    const data = await res.json();
    setTokens(data.accessToken, data.refreshToken);
    return data.accessToken;
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

function humanizeError(message: unknown) {
  if (Array.isArray(message)) return message.join(', ');
  if (typeof message === 'string') return message;
  return 'Request failed. Please try again.';
}

export async function apiFetch<T = unknown>(path: string, options: RequestInit & { skipAuth?: boolean } = {}): Promise<T> {
  const { accessToken } = getTokens();
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (accessToken && !options.skipAuth) headers.set('Authorization', `Bearer ${accessToken}`);

  let res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers, cache: 'no-store' });

  if (res.status === 401 && !options.skipAuth) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`);
      res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers, cache: 'no-store' });
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, humanizeError(body?.message) || res.statusText || 'Request failed');
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function downloadFile(path: string, fileName: string) {
  const { accessToken } = getTokens();
  const res = await fetch(`${API_BASE_URL}${path}`, { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined, cache: 'no-store' });
  if (!res.ok) { const body = await res.json().catch(() => null); throw new ApiError(res.status, humanizeError(body?.message)); }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = fileName; anchor.click();
  URL.revokeObjectURL(url);
}

export const api = {
  get: <T = unknown>(path: string) => apiFetch<T>(path, { method: 'GET' }),
  post: <T = unknown>(path: string, body?: unknown, opts: RequestInit & { skipAuth?: boolean } = {}) => apiFetch<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined, ...opts }),
  postForm: <T = unknown>(path: string, form: FormData) => apiFetch<T>(path, { method: 'POST', body: form }),
  patch: <T = unknown>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T = unknown>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
  setTokens,
  getTokens,
};
