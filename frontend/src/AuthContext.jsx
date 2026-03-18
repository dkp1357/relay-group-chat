import { createContext, useContext, useState, useCallback } from 'react'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    try {
      const raw = localStorage.getItem('relay_session')
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  })

  const login = useCallback((tokenResp) => {
    localStorage.setItem('relay_token', tokenResp.access_token)
    const s = {
      userId: tokenResp.user_id,
      username: tokenResp.username,
      isAnonymous: tokenResp.is_anonymous,
    }
    localStorage.setItem('relay_session', JSON.stringify(s))
    setSession(s)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('relay_token')
    localStorage.removeItem('relay_session')
    setSession(null)
  }, [])

  return (
    <AuthCtx.Provider value={{ session, login, logout }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
