import { defineConfig, devices } from '@playwright/test'

const liveFrontendUrl = process.env.LIVE_FRONTEND_URL

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  testIgnore: process.env.LIVE_FRONTEND_URL
    ? []
    : ['**/administration.live.spec.ts'],

  use: {
    baseURL: liveFrontendUrl ?? 'http://127.0.0.1:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  ...(liveFrontendUrl
    ? {}
    : {
        webServer: {
          command: 'npx vite',
          port: 4200,
          reuseExistingServer: !process.env.CI,
          timeout: 120 * 1000,
        },
      }),
})
