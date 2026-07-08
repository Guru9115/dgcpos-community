export function createLicenseResource(http) {
  return {
    status: () => http.get('/license/status', { skipAuth: true }),
    activate: (key) => http.post('/license/activate', { key }),
    deactivate: () => http.post('/license/deactivate'),
  }
}