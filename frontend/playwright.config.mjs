import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    colorScheme: 'light'
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium' } }
  ],
  webServer: {
    command: 'npm run build -- --outDir dist-test && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort --outDir dist-test',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 60000
  }
});
