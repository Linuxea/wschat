export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';

let accessToken = '';

export function setAccessToken(token: string) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const j = await res.json();
      message = j.message || message;
    } catch {
      /* ignore */
    }
    if (res.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }
    throw new ApiError(message, res.status);
  }

  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (null as T);
}

export const api = {
  get: <T = unknown>(path: string) => apiFetch<T>(path),
  post: <T = unknown>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T = unknown>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  del: <T = unknown>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
  upload: async (file: File | Blob) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_URL}/upload`, {
      method: 'POST',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      body: form,
    });
    if (!res.ok) throw new ApiError('upload failed', res.status);
    return (await res.json()) as {
      url: string;
      key: string;
      size: number;
      mimeType: string;
    };
  },
};
