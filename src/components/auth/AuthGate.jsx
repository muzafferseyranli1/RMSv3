import { useLocation } from 'react-router-dom'
import { AccessDeniedPage, AuthLoadingScreen, LoginPage } from '@/components/auth/AuthScreens'
import { useAuth } from '@/context/AuthContext'
import { isPublicDisplayPath } from '@/lib/publicDisplayRoutes'

export default function AuthGate({ children }) {
  const location = useLocation()
  const { authState, user, authBusy, authError, isAuthBypassed, signInWithGoogle, signOut } = useAuth()
  const isPublicDisplay = isPublicDisplayPath(location.pathname)

  if (isAuthBypassed || isPublicDisplay) {
    return children
  }

  if (authState === 'loading') {
    return <AuthLoadingScreen />
  }

  if (authState === 'unauthenticated') {
    return <LoginPage loading={authBusy} error={authError} onLogin={signInWithGoogle} />
  }

  if (authState === 'unauthorized') {
    return <AccessDeniedPage email={user?.email} error={authError} loading={authBusy} onSignOut={signOut} />
  }

  return children
}
