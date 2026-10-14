import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173', locale: 'ja-JP', timezoneId: 'Asia/Tokyo' },
  webServer: {
    command: 'npx vite build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    // iPhone 13 相当（Safari と同じ WebKit エンジン、390×844、タッチ）
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'] }, testIgnore: /offline/ },
    // 小さい iPhone（SE 相当 320px 幅）
    { name: 'iphone-se-webkit', use: { ...devices['iPhone SE'] }, testMatch: /layout/ },
    // Service Worker のオフライン検証（Playwright の WebKit は SW のネットワーク遮断検証が不安定なため Chromium で実施）
    { name: 'offline-chromium', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } }, testMatch: /offline/ },
  ],
})
