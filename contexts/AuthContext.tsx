'use client'
import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, usePathname } from 'next/navigation'

type Perfil = {
  id: string
  email: string
  nome: string
  papel: 'coordenador' | 'mentor' | 'aluno'
  status: 'pendente' | 'aprovado' | 'bloqueado'
  mentor_nome?: string
  aluno_id?: string
}

type AuthCtx = {
  perfil: Perfil | null
  loading: boolean
  signOut: () => void
}

const AuthContext = createContext<AuthCtx>({ perfil: null, loading: true, signOut: () => {} })

const PUBLIC_ROUTES = ['/login', '/cadastro', '/aguardando', '/reset-password']
// Rotas onde usuários autenticados NÃO devem ser redirecionados para o dashboard
const NO_REDIRECT_FROM = ['/reset-password']
const TIMEOUT_MS = 25000

// Lê sessão direto do localStorage — evita lock/hang do cliente JS
function getSessionFromStorage(): { access_token: string; user: { id: string } } | null {
  try {
    if (typeof window === 'undefined') return null
    const ref = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace('https://', '').replace('.supabase.co', '')
    const raw = localStorage.getItem(`sb-${ref}-auth-token`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.access_token) return null
    // Ignora tokens expirados
    if (parsed.expires_at && parsed.expires_at < Math.floor(Date.now() / 1000)) return null
    return parsed
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeoutError, setTimeoutError] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Inicialização da sessão — roda uma única vez
  useEffect(() => {
    // Timeout só faz sentido em rotas protegidas onde o usuário precisa estar autenticado
    if (!PUBLIC_ROUTES.includes(pathname)) {
      timerRef.current = setTimeout(() => {
        setLoading(false)
        setTimeoutError(true)
      }, TIMEOUT_MS)
    }

    async function init() {
      try {
        // Lê sessão direto do localStorage para evitar lock do cliente JS
        const session = getSessionFromStorage()
        if (!session?.access_token) return

        // Busca perfil via REST com timeout explícito — evita hang do cliente JS
        const ctrl = new AbortController()
        const tid = setTimeout(() => ctrl.abort(), 22000)
        try {
          const resp = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/perfis?id=eq.${session.user.id}&select=*`,
            {
              headers: {
                'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
                'Authorization': `Bearer ${session.access_token}`,
              },
              signal: ctrl.signal,
            }
          )
          if (resp.ok) {
            const data = await resp.json()
            if (Array.isArray(data) && data.length > 0) setPerfil(data[0])
          }
        } finally {
          clearTimeout(tid)
        }
      } catch (e) {
        console.error('Auth error:', e)
      } finally {
        if (timerRef.current) clearTimeout(timerRef.current)
        setLoading(false)
        setTimeoutError(false)
      }
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
          return
        } else if (event === 'SIGNED_OUT') {
          setPerfil(null)
        }
      }
    )

    return () => {
      subscription.unsubscribe()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  // Lógica de redirect — roda quando perfil, loading ou rota mudam
  useEffect(() => {
    if (loading) return

    if (!perfil) {
      if (!PUBLIC_ROUTES.includes(pathname)) router.push('/login')
      return
    }

    if (perfil.status === 'pendente' && pathname !== '/aguardando') {
      router.push('/aguardando')
      return
    }

    if (PUBLIC_ROUTES.includes(pathname) && !NO_REDIRECT_FROM.includes(pathname) && perfil.status !== 'pendente') {
      if (perfil.papel === 'coordenador') router.push('/')
      else if (perfil.papel === 'mentor') router.push('/mentor')
      else if (perfil.papel === 'aluno') router.push('/meu-perfil')
    }
  }, [perfil, loading, pathname])

  async function signOut() {
    await supabase.auth.signOut()
    setPerfil(null)
    router.push('/login')
  }

  // Tela de timeout — botão para tentar novamente (não mostrar em rotas de auth especiais)
  if (timeoutError && !NO_REDIRECT_FROM.includes(pathname)) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', background: '#F7F6F3',
        gap: 16, padding: 24, textAlign: 'center', fontFamily: 'DM Sans, sans-serif'
      }}>
        <div style={{ fontSize: 40 }}>🔄</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a' }}>Conexão lenta</div>
        <div style={{ fontSize: 13, color: '#888', maxWidth: 280, lineHeight: 1.6 }}>
          Demorou mais que o esperado para carregar. Verifique sua conexão e tente novamente.
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: 8, padding: '12px 32px', borderRadius: 12,
            background: '#534AB7', color: 'white', border: 'none',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'DM Sans, sans-serif'
          }}
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{ perfil, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
