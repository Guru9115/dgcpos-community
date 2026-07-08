#!/usr/bin/env node
/**
 * Export yesterday's daily sales report via @dgcpos/client.
 *
 * Usage:
 *   DGCPOS_URL=http://localhost:5000 \
 *   DGCPOS_USER=owner DGCPOS_PASS=owner123 \
 *   node examples/nightly-export.mjs
 */
import { DgcPosClient } from '../src/index.js'

const baseUrl = process.env.DGCPOS_URL || 'http://localhost:5000'
const username = process.env.DGCPOS_USER
const password = process.env.DGCPOS_PASS

if (!username || !password) {
  console.error('Set DGCPOS_USER and DGCPOS_PASS')
  process.exit(1)
}

const client = new DgcPosClient({ baseUrl })
await client.auth.login({ username, password })

const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10)
const report = await client.reports.daily({ date: yesterday })
console.log(JSON.stringify({ date: yesterday, report }, null, 2))