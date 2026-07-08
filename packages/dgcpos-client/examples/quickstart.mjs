#!/usr/bin/env node
/**
 * Minimal SDK smoke test against a running DGCPOS instance.
 */
import { DgcPosClient } from '../src/index.js'

const baseUrl = process.env.DGCPOS_URL || 'http://localhost:5000'
const client = new DgcPosClient({ baseUrl })

const health = await client.platform.health()
const edition = await client.platform.edition()
console.log('health:', health.status, '| edition:', edition.edition)

if (process.env.DGCPOS_USER && process.env.DGCPOS_PASS) {
  await client.auth.login({
    username: process.env.DGCPOS_USER,
    password: process.env.DGCPOS_PASS,
  })
  const kpis = await client.dashboard.kpis()
  const count = (await client.products.list()).length
  console.log('products:', count, '| revenue today:', kpis?.revenue_today ?? '—')
}