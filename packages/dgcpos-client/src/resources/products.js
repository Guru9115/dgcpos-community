export function createProductsResource(http) {
  return {
    list: (params) => http.get('/products/', { params }),
    get: (id) => http.get(`/products/${id}`),
    getByBarcode: (barcode) => http.get(`/products/barcode/${encodeURIComponent(barcode)}`),
    create: (data) => http.post('/products/', data),
    update: (id, data) => http.put(`/products/${id}`, data),
    remove: (id) => http.delete(`/products/${id}`),
    categories: () => http.get('/products/categories'),
    createCategory: (data) => http.post('/products/categories', data),
    sampleCatalog: () => http.get('/products/sample-catalog'),
  }
}