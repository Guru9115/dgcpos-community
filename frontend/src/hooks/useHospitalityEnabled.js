import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../store/AuthContext'
import { hospitalityAPI } from '../api'

/** Hospitality flag from /auth/me when available — avoids an extra API round-trip. */
export function useHospitalityEnabled() {
  const { user } = useAuth()
  const fromUser = user?.hospitality_enabled

  const { data, isLoading } = useQuery({
    queryKey: ['hospitality-status'],
    queryFn: () => hospitalityAPI.getStatus().then((r) => r.data),
    enabled: !!user && fromUser === undefined,
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  })

  if (fromUser !== undefined) {
    return { enabled: !!fromUser, isLoading: false }
  }
  return { enabled: !!data?.enabled, isLoading }
}