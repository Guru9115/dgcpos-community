export function createSuppliersResource(http) {
  return {
    list: () => http.get('/suppliers/'),
    create: (data) => http.post('/suppliers/', data),
    update: (id, data) => http.put(`/suppliers/${id}`, data),
    remove: (id) => http.delete(`/suppliers/${id}`),
  }
}