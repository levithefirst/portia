import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

/** Writes dist/sw-precache.json: the entry assets referenced by index.html, for public/sw.js. */
function swPrecache(): Plugin {
  let outDir = 'dist'
  return {
    name: 'portia-sw-precache',
    apply: 'build',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir)
    },
    closeBundle() {
      const html = readFileSync(resolve(outDir, 'index.html'), 'utf8')
      const assets = [...new Set(html.match(/\/assets\/[^"'\s>]+/g) ?? [])]
      writeFileSync(resolve(outDir, 'sw-precache.json'), JSON.stringify(assets) + '\n')
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), swPrecache()],
})
