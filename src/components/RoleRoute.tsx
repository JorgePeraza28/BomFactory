import { Navigate } from 'react-router-dom'
import { useRole } from '../hooks/useRole'
import type { Permissions } from '../hooks/useRole'

interface Props {
  perm: keyof Permissions
  children: React.ReactNode
  fallback?: string
}

export default function RoleRoute({ perm, children, fallback = '/orders' }: Props) {
  const perms = useRole()
  if (!perms[perm]) return <Navigate to={fallback} replace />
  return <>{children}</>
}
