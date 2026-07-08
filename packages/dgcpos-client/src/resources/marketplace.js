export function createMarketplaceResource(http) {
  return {
    list: (params) => http.get('/marketplace/', { params }),
    get: (id) => http.get(`/marketplace/${id}`),
    create: (data) => http.post('/marketplace/', data),
    createFromProduct: (productId, data) =>
      http.post(`/marketplace/from-product/${productId}`, data),
    remove: (id) => http.delete(`/marketplace/${id}`),
    like: (id) => http.post(`/marketplace/${id}/like`),
    orders: (params) => http.get('/marketplace/orders', { params }),
    updateOrderStatus: (orderId, data) =>
      http.put(`/marketplace/orders/${orderId}/status`, data),
    publicFeed: (params) =>
      http.get('/marketplace/public', { params, skipAuth: true }),
    publicShopConfig: (params) =>
      http.get('/marketplace/public/shop-config', { params, skipAuth: true }),
  }
}