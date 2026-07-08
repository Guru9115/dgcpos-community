import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('edition route gating', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('allows all paths in enterprise edition', async () => {
    vi.stubEnv('VITE_DGCPOS_EDITION', 'enterprise')
    const { isNavPathEnabled } = await import('./index.js')
    expect(isNavPathEnabled('/hotel/bookings')).toBe(true)
    expect(isNavPathEnabled('/admin')).toBe(true)
  })

  it('hides enterprise routes in community edition', async () => {
    vi.stubEnv('VITE_DGCPOS_EDITION', 'community')
    const { isNavPathEnabled } = await import('./index.js')
    expect(isNavPathEnabled('/pos')).toBe(true)
    expect(isNavPathEnabled('/marketplace')).toBe(true)
    expect(isNavPathEnabled('/hotel')).toBe(false)
    expect(isNavPathEnabled('/payables')).toBe(false)
    expect(isNavPathEnabled('/admin/users')).toBe(false)
  })
})