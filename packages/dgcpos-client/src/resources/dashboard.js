export function createDashboardResource(http) {
  return {
    kpis: (params) => http.get('/dashboard/kpis', { params }),
    salesTrend: (params) => http.get('/dashboard/sales-trend', { params }),
    topProducts: (params) => http.get('/dashboard/top-products', { params }),
    recentTransactions: (params) => http.get('/dashboard/recent-transactions', { params }),
    monthlyRevenue: (params) => http.get('/dashboard/monthly-revenue', { params }),
    hourlySales: (params) => http.get('/dashboard/hourly-sales', { params }),
    paymentBreakdown: (params) => http.get('/dashboard/payment-breakdown', { params }),
    topCustomers: (params) => http.get('/dashboard/top-customers', { params }),
    bundle: (params) => http.get('/dashboard/bundle', { params }),
  }
}