export function createInventoryResource(http) {
  return {
    movements: (params) => http.get('/inventory/movements', { params }),
    adjust: (data) => http.post('/inventory/adjust', data),
    lowStock: () => http.get('/inventory/low-stock'),
    valuation: () => http.get('/inventory/valuation'),
  }
}