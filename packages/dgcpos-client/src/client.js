import { createHttp } from './http.js'
import { createAuthResource } from './resources/auth.js'
import { createProductsResource } from './resources/products.js'
import { createSalesResource } from './resources/sales.js'
import { createCustomersResource } from './resources/customers.js'
import { createInventoryResource } from './resources/inventory.js'
import { createReportsResource } from './resources/reports.js'
import { createPlatformResource } from './resources/platform.js'
import { createSettingsResource } from './resources/settings.js'
import { createTeamResource } from './resources/team.js'
import { createMarketplaceResource } from './resources/marketplace.js'
import { createLicenseResource } from './resources/license.js'
import { createSuppliersResource } from './resources/suppliers.js'
import { createDashboardResource } from './resources/dashboard.js'

export class DgcPosClient {
  /**
   * @param {object} options
   * @param {string} options.baseUrl - API host, e.g. https://api.example.com or http://localhost:5000
   * @param {string} [options.token] - Bearer access token
   * @param {string} [options.refreshToken] - Refresh token for automatic renewal
   */
  constructor({ baseUrl, token, refreshToken } = {}) {
    if (!baseUrl) throw new Error('baseUrl is required')
    this.baseUrl = baseUrl
    this._token = token ?? null
    this._refreshToken = refreshToken ?? null

    this._http = createHttp({
      baseUrl: this.baseUrl,
      getToken: () => this._token,
      setTokens: (t, r) => this._setSession({ token: t, refresh_token: r }),
      onUnauthorized: async () => {
        if (!this._refreshToken) return false
        try {
          await this.auth.refresh(this._refreshToken)
          return true
        } catch {
          this._clearSession()
          return false
        }
      },
    })

    this.auth = createAuthResource(this._http, this)
    this.products = createProductsResource(this._http)
    this.sales = createSalesResource(this._http)
    this.customers = createCustomersResource(this._http)
    this.inventory = createInventoryResource(this._http)
    this.reports = createReportsResource(this._http)
    this.platform = createPlatformResource(this._http)
    this.settings = createSettingsResource(this._http)
    this.team = createTeamResource(this._http)
    this.marketplace = createMarketplaceResource(this._http)
    this.license = createLicenseResource(this._http)
    this.suppliers = createSuppliersResource(this._http)
    this.dashboard = createDashboardResource(this._http)
  }

  _setSession({ token, refresh_token: refreshToken, user } = {}) {
    if (token) this._token = token
    if (refreshToken) this._refreshToken = refreshToken
    return { token: this._token, refresh_token: this._refreshToken, user }
  }

  _clearSession() {
    this._token = null
    this._refreshToken = null
  }

  get token() {
    return this._token
  }

  get refreshToken() {
    return this._refreshToken
  }
}