import { Outlet } from 'react-router-dom'
import { useAuth } from '../../store/AuthContext'
import Layout from './Layout'
import CommandCenterLayout from '../admin/CommandCenterLayout'

export default function AppShell() {
  const { user } = useAuth()
  // Superadmin = company director — Command Center on app + admin hosts (not merchant hotel/retail UI)
  const useCommandCenter = user?.role === 'superadmin'

  if (useCommandCenter) {
    return <CommandCenterLayout />
  }

  return <Layout />
}