import { Navigate } from 'react-router-dom'
import { isEnterprise } from './index'

/** Renders children only in Enterprise Edition; redirects CE users to dashboard. */
export default function EnterpriseRoute({ children, fallback = '/' }) {
  if (!isEnterprise()) {
    return <Navigate to={fallback} replace />
  }
  return children
}