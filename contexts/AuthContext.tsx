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

const PUBLIC_ROUTES = ['/login', '/cadastro', '/aguardando']
const TIMEOUT_MS = 8000

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeoutError, setTimeoutError] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Timeout de segurança — se demorar mais de 8s, sai do loading
    timerRef.current = setTimeout(() => {
      setLoading(false)
      setTimeoutError(true)
    }, TIMEOUT_MS)

    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (!session) {
          if (!PUBLIC_ROUTES.includes(pathname)) router.push('/login')
          return
        }

        const { data: perfilData, error } = await supabase
          .from('perfis')
          .select('*')
          .eq('id', session.user.id)
          .single()

        if (error || !perfilData) {
          if (!PUBLIC_ROUTES.includes(pathname)) router.push('/login')
          return
        }

        setPerfil(perfilData)

        if (PUBLIC_ROUTES.includes(pathname)) {
          if (perfilData.status === 'pendente') router.push('/aguardando')
          else if (perfilData.papel === 'coordenador') router.push('/')
          else if (perfilData.papel === 'mentor') router.push('/mentor')
          else if (perfilData.papel === 'aluno') router.push('/meu-perfil')
        }
      } catch (e) {
        console.error('Auth error:', e)
        if (!PUBLIC_ROUTES.includes(pathname)) router.push('/login')
      } finally {
        if (timerRef.current) clearTimeout(timerRef.current)
        setLoading(false)
        setTimeoutError(false)
      }
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') {
          setPerfil(null)
          router.push('/login')
        } else if (event === 'SIGNED_IN' && session) {
          const { data } = await supabase
            .from('perfis')
            .select('*')
            .eq('id', session.user.id)
            .single()
          if (data) {
            setPerfil(data)
            if (PUBLIC_ROUTES.includes(pathname)) {
              if (data.papel === 'coordenador') router.push('/')
              else if (data.papel === 'mentor') router.push('/mentor')
              else if (data.papel === 'aluno') router.push('/meu-perfil')
              else router.push('/aguardando')
            }
          }
        }
      }
    )

    return () => {
      subscription.unsubscribe()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [pathname])

  async function signOut() {
    await supabase.auth.signOut()
    setPerfil(null)
    router.push('/login')
  }

  // Tela de timeout — botão para tentar novamente
  if (timeoutError) {
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
