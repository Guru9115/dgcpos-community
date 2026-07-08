export function createSettingsResource(http) {
  return {
    get: () => http.get('/settings/'),
    update: (data) => http.put('/settings/', data),
    version: () => http.get('/settings/version'),
    backupStatus: () => http.get('/settings/backup/status'),
  }
}