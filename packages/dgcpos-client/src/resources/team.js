export function createTeamResource(http) {
  return {
    context: () => http.get('/team/context'),
    getUser: (id) => http.get(`/team/users/${id}`),
    updateUser: (id, data) => http.put(`/team/users/${id}`, data),
    resetPassword: (id, data) => http.post(`/team/users/${id}/reset-password`, data),
    setStatus: (id, data) => http.put(`/team/users/${id}/status`, data),
  }
}