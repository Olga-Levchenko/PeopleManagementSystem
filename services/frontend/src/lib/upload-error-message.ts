import axios from 'axios'

export const resolveUploadErrorMessage = (
  error: unknown,
  fallback: string,
  tooLargeMessage: string,
): string => {
  if (axios.isAxiosError(error) && error.response?.status === 413) {
    return tooLargeMessage
  }
  return fallback
}
