#!/usr/bin/env node
/**
 * Re-register local native plugins after `cap sync` (npm-only scan drops App-target plugins).
 * Swift classes in the App target need the module prefix: App.ClassName
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const LOCAL_IOS_PLUGINS = [
  'App.DgcCoreAIPlugin',
]

const iosCapConfig = path.join(root, 'ios/App/App/capacitor.config.json')

if (fs.existsSync(iosCapConfig)) {
  const cap = JSON.parse(fs.readFileSync(iosCapConfig, 'utf8'))
  const merged = [...new Set([...(cap.packageClassList || []), ...LOCAL_IOS_PLUGINS])]
  cap.packageClassList = merged
  fs.writeFileSync(iosCapConfig, `${JSON.stringify(cap, null, '\t')}\n`)
  console.log('[cap-local-plugins] iOS packageClassList:', LOCAL_IOS_PLUGINS.join(', '))
}