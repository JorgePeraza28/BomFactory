import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Correo o contraseña incorrectos')
      setLoading(false)
    } else {
      navigate('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center p-4"
      style={{
        backgroundImage: `
          radial-gradient(ellipse at 20% 50%, rgba(120,120,180,0.08) 0%, transparent 60%),
          radial-gradient(ellipse at 80% 20%, rgba(100,160,220,0.07) 0%, transparent 50%)
        `
      }}
    >
      {/* Card */}
      <div className="w-full max-w-sm">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white shadow-md mb-4"
            style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect x="2" y="2" width="10" height="10" rx="2" fill="#1D1D1F"/>
              <rect x="16" y="2" width="10" height="10" rx="2" fill="#1D1D1F" opacity="0.4"/>
              <rect x="2" y="16" width="10" height="10" rx="2" fill="#1D1D1F" opacity="0.4"/>
              <rect x="16" y="16" width="10" height="10" rx="2" fill="#1D1D1F"/>
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-[#1D1D1F] tracking-tight">BOM Factory</h1>
          <p className="text-sm text-[#6E6E73] mt-1 font-light">Sistema de manufactura</p>
        </div>

        {/* Form card */}
        <div
          className="rounded-3xl p-8"
          style={{
            background: 'rgba(255,255,255,0.75)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: '0 2px 40px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)',
          }}
        >
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#6E6E73] mb-1.5 uppercase tracking-wider">
                Correo electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="usuario@empresa.com"
                className="w-full px-4 py-3 rounded-xl text-sm text-[#1D1D1F] placeholder-[#AEAEB2] outline-none transition-all"
                style={{
                  background: 'rgba(118,118,128,0.08)',
                  border: '1px solid rgba(0,0,0,0.06)',
                }}
                onFocus={e => e.currentTarget.style.border = '1px solid rgba(0,113,227,0.4)'}
                onBlur={e => e.currentTarget.style.border = '1px solid rgba(0,0,0,0.06)'}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#6E6E73] mb-1.5 uppercase tracking-wider">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl text-sm text-[#1D1D1F] placeholder-[#AEAEB2] outline-none transition-all"
                style={{
                  background: 'rgba(118,118,128,0.08)',
                  border: '1px solid rgba(0,0,0,0.06)',
                }}
                onFocus={e => e.currentTarget.style.border = '1px solid rgba(0,113,227,0.4)'}
                onBlur={e => e.currentTarget.style.border = '1px solid rgba(0,0,0,0.06)'}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-100">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="6" stroke="#FF3B30" strokeWidth="1.5"/>
                  <path d="M7 4v3M7 9.5v.5" stroke="#FF3B30" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-medium text-white transition-all mt-2"
              style={{
                background: loading ? '#AEAEB2' : '#1D1D1F',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                  Entrando...
                </span>
              ) : 'Iniciar sesión'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-[#AEAEB2] mt-6">
          BOM Factory · Sistema interno de manufactura
        </p>
      </div>
    </div>
  )
}
