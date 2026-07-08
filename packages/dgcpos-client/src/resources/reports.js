export function createReportsResource(http) {
  return {
    daily: (params) => http.get('/reports/daily', { params }),
    summary: (params) => http.get('/reports/summary', { params }),
    inventory: () => http.get('/reports/inventory'),
    products: (params) => http.get('/reports/products', { params }),
  }
}