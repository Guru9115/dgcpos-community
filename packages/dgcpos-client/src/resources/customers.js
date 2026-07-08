export function createCustomersResource(http) {
  return {
    list: (params) => http.get('/customers/', { params }),
    get: (id) => http.get(`/customers/${id}`),
    create: (data) => http.post('/customers/', data),
    update: (id, data) => http.put(`/customers/${id}`, data),
    remove: (id) => http.delete(`/customers/${id}`),
    tiers: () => http.get('/customers/tiers'),
    adjustPoints: (id, data) => http.post(`/customers/${id}/adjust-points`, data),
    pointHistory: (id) => http.get(`/customers/${id}/point-history`),
  }
}