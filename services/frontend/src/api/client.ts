/**
 * Axios HTTP client
 */

import axios from 'axios'
import type { AxiosInstance, AxiosRequestConfig } from 'axios'
import { env } from '@/config/env'

class ApiClient {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: env.api.baseUrl,
      timeout: env.api.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
      // Required for the session cookie to be included on cross-origin BFF requests
      // (localhost:4200 → localhost:3001). Without this, the browser strips the cookie and
      // every authenticated BFF call returns 401.
      withCredentials: true,
    })

    this.setupInterceptors()
  }

  private setupInterceptors() {
    this.client.interceptors.request.use(
      config => config,
      error => Promise.reject(error)
    )

    this.client.interceptors.response.use(
      response => response,
      (error: unknown) => {
        // Redirect to the login page on any 401 response so the user can re-authenticate.
        // Full-page navigation clears any stale in-memory state and starts a fresh auth flow.
        if (
          axios.isAxiosError(error) &&
          error.response?.status === 401 &&
          // Avoid an infinite redirect loop if the /me check itself returns 401 (AuthContext
          // handles that case directly without going through the axios client).
          !error.config?.url?.includes('/auth/me')
        ) {
          window.location.href = '/login'
        }
        return Promise.reject(error)
      }
    )
  }

  /**
   * Generic GET request
   */
  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(url, config)
    return response.data
  }

  /**
   * Generic POST request
   */
  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post<T>(url, data, config)
    return response.data
  }

  /**
   * Generic PUT request
   */
  async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.put<T>(url, data, config)
    return response.data
  }

  async patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.patch<T>(url, data, config)
    return response.data
  }

  /**
   * Generic DELETE request
   */
  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(url, config)
    return response.data
  }

  /**
   * Raw axios instance for advanced usage
   */
  get raw(): AxiosInstance {
    return this.client
  }
}

// Export singleton instance
export const apiClient = new ApiClient()
