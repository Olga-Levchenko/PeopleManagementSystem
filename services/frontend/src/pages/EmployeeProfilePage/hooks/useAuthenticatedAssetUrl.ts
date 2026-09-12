import { useEffect, useState } from 'react'
import { apiClient } from '@/api/client'
import { resolveBffUrl } from '@/lib/resolve-bff-url'

/**
 * Fetches a session-gated BFF asset (photo, certificate) as a blob URL for display/download.
 * `revision` busts the browser cache when the underlying file changes but the API path stays
 * the same (e.g. profile photo is always GET .../profile/photo).
 */
export const useAuthenticatedAssetUrl = (
  relativeUrl: string | null | undefined,
  revision = 0,
): string | null => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!relativeUrl) {
      return
    }

    let activeObjectUrl: string | null = null
    let cancelled = false

    void apiClient.raw
      .get(resolveBffUrl(relativeUrl), {
        responseType: 'blob',
        // Same path, new bytes — avoid serving a stale cached response after re-upload.
        params: revision > 0 ? { _v: revision } : undefined,
      })
      .then(response => {
        if (cancelled) {
          return
        }
        activeObjectUrl = URL.createObjectURL(response.data)
        setBlobUrl(activeObjectUrl)
      })
      .catch(() => {
        if (!cancelled) {
          setBlobUrl(null)
        }
      })

    return () => {
      cancelled = true
      if (activeObjectUrl) {
        URL.revokeObjectURL(activeObjectUrl)
      }
      setBlobUrl(null)
    }
  }, [relativeUrl, revision])

  if (!relativeUrl) {
    return null
  }

  return blobUrl
}
