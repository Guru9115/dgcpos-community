#!/usr/bin/env node
/** Remove PWA service-worker files from dist before Capacitor sync (breaks iOS WKWebView). */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')

for (const name of fs.readdirSync(dist)) {
  if (name === 'sw.js' || name.startsWith('workbox-') || name === 'registerSW.js') {
    fs.unlinkSync(path.join(dist, name))
    console.log('[cap-prune] removed', name)
  }
}