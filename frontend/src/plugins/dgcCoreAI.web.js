export class DgcCoreAIWeb {
  async processProductPhoto() {
    throw new Error('Core AI product capture requires the DGC POS iOS app.')
  }

  async generateFootnote({ productName = 'Bazaar Listing' }) {
    return {
      footnote: `${productName} — listed for DGC Bazaar (web preview; full AI reasoning on iOS).`,
      reasoning: ['Web fallback: install the iOS app for on-device Vision processing.'],
      bazaarCategory: 'general',
    }
  }

  async startHealthMonitor() {
    return { started: false, intervalMinutes: 0 }
  }

  async stopHealthMonitor() {
    return { stopped: true }
  }

  async checkHealthNow() {
    const res = await fetch('https://api.dgcpos.net/api/health')
    const health = await res.json()
    return {
      checked_at: new Date().toISOString(),
      api_healthy: health?.status === 'ok',
      platform_healthy: true,
      software_health: health?.status === 'ok' ? 'healthy' : 'degraded',
      health,
    }
  }

  async getEngineInfo() {
    return { name: 'DGC Core AI', onDevice: false, frameworks: ['web-fallback'] }
  }

  async scanInventoryTable() {
    throw new Error('Inventory table scan requires the DGC POS iOS app.')
  }

  async getStabilitySnapshot() {
    return { metrickit_active: false, reports_on_disk: 0, note: 'iOS app only' }
  }
}