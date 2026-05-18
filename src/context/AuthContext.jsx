export function AuthProvider({ children }) {
  return children
}

export function useAuth() {
  return {
    isAuthBypassed: true,
    user: null,
    authState: 'authenticated',
    isAuthenticated: true,
    authBusy: false,
    authError: '',
    accessRecord: null,
    session: null,
    signInWithGoogle: async () => {},
    signOut: async () => {},
  }
}
