import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DgcPosClient, DgcPosError } from '../src/index.js'

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('DgcPosClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requires baseUrl', () => {
    expect(() => new DgcPosClient()).toThrow('baseUrl is required')
  })

  it('logs in and stores tokens', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({
      token: 'access-1',
      refresh_token: 'refresh-1',
      user: { id: 1, username: 'owner' },
    }))

    const client = new DgcPosClient({ baseUrl: 'http://localhost:5000' })
    const session = await client.auth.login({ username: 'owner', password: 'secret' })

    expect(session.token).toBe('access-1')
    expect(client.token).toBe('access-1')
    expect(client.refreshToken).toBe('refresh-1')
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:5000/api/auth/login',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('lists products with bearer token', async () => {
    fetch.mockResolvedValueOnce(jsonResponse([{ id: 1, name: 'Tea' }]))

    const client = new DgcPosClient({
      baseUrl: 'http://localhost:5000',
      token: 'tok',
    })
    const products = await client.products.list({ page: 1 })

    expect(products).toHaveLength(1)
    const [, opts] = fetch.mock.calls[0]
    expect(opts.headers.Authorization).toBe('Bearer tok')
  })

  it('throws DgcPosError on API errors', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ error: 'Invalid credentials' }, 401))

    const client = new DgcPosClient({ baseUrl: 'http://localhost:5000' })
    await expect(client.auth.login({ username: 'x', password: 'y' }))
      .rejects
      .toBeInstanceOf(DgcPosError)
  })

  it('fetches public health without auth', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ status: 'ok', edition: 'community' }))

    const client = new DgcPosClient({ baseUrl: 'http://localhost:5000' })
    const health = await client.platform.health()

    expect(health.status).toBe('ok')
    const [, opts] = fetch.mock.calls[0]
    expect(opts.headers.Authorization).toBeUndefined()
  })

  it('fetches license status without auth', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ licensed: false, edition: 'community' }))

    const client = new DgcPosClient({ baseUrl: 'http://localhost:5000' })
    const status = await client.license.status()

    expect(status.licensed).toBe(false)
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:5000/api/license/status',
      expect.any(Object),
    )
  })

  it('loads dashboard kpis with auth', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ revenue_today: 1200 }))

    const client = new DgcPosClient({ baseUrl: 'http://localhost:5000', token: 'tok' })
    const kpis = await client.dashboard.kpis()

    expect(kpis.revenue_today).toBe(1200)
  })

  it('lists marketplace posts', async () => {
    fetch.mockResolvedValueOnce(jsonResponse([{ id: 1, title: 'Listing' }]))

    const client = new DgcPosClient({ baseUrl: 'http://localhost:5000', token: 'tok' })
    const posts = await client.marketplace.list()

    expect(posts).toHaveLength(1)
  })

  it('reads store settings', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ shop_name: 'Demo Store' }))

    const client = new DgcPosClient({ baseUrl: 'http://localhost:5000', token: 'tok' })
    const settings = await client.settings.get()

    expect(settings.shop_name).toBe('Demo Store')
  })
})