/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

// ビルド成果物の一覧を Service Worker に埋め込み、初回訪問時に全ファイルをキャッシュする
function serviceWorker(): Plugin {
  return {
    name: 'life-os-sw',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'))
      const statics = ['manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png']
      const precache = ['./', ...new Set([...files, ...statics])].map((f) => (f === './' ? f : './' + f))
      const version = Date.now().toString(36)
      const src = readFileSync('src/sw.template.js', 'utf8')
        .replace('__PRECACHE__', JSON.stringify(precache))
        .replace('__VERSION__', version)
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: src })
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), serviceWorker()],
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
})
