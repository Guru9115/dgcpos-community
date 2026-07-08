export function createSalesResource(http) {
  return {
    list: (params) => http.get('/sales/', { params }),
    get: (id) => http.get(`/sales/${id}`),
    create: (data) => http.post('/sales/', data),
    void: (id) => http.put(`/sales/${id}/void`),
    refund: (id, data) => http.put(`/sales/${id}/refund`, data),
  }
}