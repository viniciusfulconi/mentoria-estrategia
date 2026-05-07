'use client'
import { createContext, useContext, useEffect, useState } from 'react'
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

const PUBLIC_ROUTES = ['/login', '/cadastro']

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    async function loadUser() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setLoading(false)
        if (!PUBLIC_ROUTES.includes(pathname)) router.push('/login')
        return
      }
      const { data } = await supabase.from('perfis').select('*').eq('id', session.user.id).single()
      setPerfil(data)
      setLoading(false)
      if (!data && !PUBLIC_ROUTES.includes(pathname)) router.push('/login')
    }
    loadUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setPerfil(null)
        router.push('/login')
      } else if (session) {
        const { data } = await supabase.from('perfis').select('*').eq('id', session.user.id).single()
        setPerfil(data)
      }
    })
    return () => subscription.unsubscribe()
  }, [pathname])

  async function signOut() {
    await supabase.auth.signOut()
    setPerfil(null)
    router.push('/login')
  }

  // Redireciona pendentes/bloqueados
  useEffect(() => {
    if (!loading && perfil && !PUBLIC_ROUTES.includes(pathname)) {
      if (perfil.status === 'pendente') router.push('/aguardando')
      if (perfil.status === 'bloqueado') router.push('/login')
    }
  }, [perfil, loading, pathname])

  return (
    <AuthContext.Provider value={{ perfil, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
