import { useState } from 'react'
import { AuthProvider, useAuth } from './AuthContext'
import AuthScreen from './components/AuthScreen'
import Dashboard from './components/Dashboard'
import Chat from './components/Chat'

function Inner() {
  const { session } = useAuth()
  const [activeRoom, setActiveRoom] = useState(null)

  if (!session) return <AuthScreen />

  if (activeRoom) {
    return <Chat slug={activeRoom} onBack={() => setActiveRoom(null)} />
  }

  return <Dashboard onEnterRoom={setActiveRoom} />
}

export default function App() {
  return (
    <AuthProvider>
      <Inner />
      <style>{`
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(100,100,100,0.3); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(100,100,100,0.5); }
      `}</style>
    </AuthProvider>
  )
}
