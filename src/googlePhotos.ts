export type GooglePhotosStatus = { configured: boolean; connected: boolean; scope: string }
export type PickerSession = { id: string; pickerUri: string; pollAfterMs: number; timeoutMs: number }
export type PickerSessionStatus = { ready: boolean; pollAfterMs: number; timeoutMs: number }
export type ImportResult = { selected: number; imported: number; duplicates: number; videosSkipped: number }

export class GooglePhotosApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(message: string, code: string, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, { ...init, headers: { Accept: 'application/json', ...init?.headers } })
  } catch {
    throw new GooglePhotosApiError('No pude hablar con el importador local. ¿Está abierto con npm run dev?', 'NETWORK_ERROR', 0)
  }
  const payload = await response.json().catch(() => ({})) as { error?: { code?: string; message?: string } }
  if (!response.ok) {
    throw new GooglePhotosApiError(
      payload.error?.message ?? 'Google Fotos no respondió como esperábamos.',
      payload.error?.code ?? 'UNKNOWN_ERROR',
      response.status,
    )
  }
  return payload as T
}

export const googlePhotosApi = {
  status: (signal?: AbortSignal) => apiRequest<GooglePhotosStatus>('/api/google-photos/status', { signal }),
  createSession: (signal?: AbortSignal) => apiRequest<PickerSession>('/api/google-photos/sessions', { method: 'POST', signal }),
  sessionStatus: (id: string, signal?: AbortSignal) => apiRequest<PickerSessionStatus>(`/api/google-photos/sessions/${encodeURIComponent(id)}`, { signal }),
  importSession: (id: string, signal?: AbortSignal) => apiRequest<ImportResult>(`/api/google-photos/sessions/${encodeURIComponent(id)}/import`, { method: 'POST', signal }),
  cancelSession: (id: string) => apiRequest<{ cancelled: true }>(`/api/google-photos/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}
