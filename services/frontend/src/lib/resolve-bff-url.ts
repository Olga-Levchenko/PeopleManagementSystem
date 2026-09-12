import { env } from '@/config/env'

/** Turn a BFF-relative API path into an absolute URL the browser can request. */
export const resolveBffUrl = (relativePath: string): string => {
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
    return relativePath
  }
  const base = env.api.baseUrl.replace(/\/$/, '')
  const path = relativePath.startsWith('/') ? relativePath : `/${relativePath}`
  return `${base}${path}`
}
