export function createPlatformResource(http) {
  return {
    health: () => http.get('/health', { skipAuth: true }),
    edition: () => http.get('/edition', { skipAuth: true }),
    platformStatus: () => http.get('/platform-status', { skipAuth: true }),
  }
}