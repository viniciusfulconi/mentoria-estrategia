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

const PUBLIC_ROUTES = ['/login', '/cadastro', '/aguardando']

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        setLoading(false)
        if (!PUBLIC_ROUTES.includes(pathname)) {
          router.push('/login')
        }
        return
      }

      const { data: perfilData } = await supabase
        .from('perfis')
        .select('*')
        .eq('id', session.user.id)
        .single()

      if (perfilData) {
        setPerfil(perfilData)
        // Redireciona baseado no perfil apenas se estiver numa rota pública
        if (PUBLIC_ROUTES.includes(pathname)) {
          if (perfilData.status === 'pendente') router.push('/aguardando')
          else if (perfilData.papel === 'coordenador') router.push('/')
          else if (perfilData.papel === 'mentor') router.push('/mentor')
          else if (perfilData.papel === 'aluno') router.push('/meu-perfil')
        }
      } else {
        // Tem sessão mas não tem perfil — vai para login
        await supabase.auth.signOut()
        router.push('/login')
      }
      
      setLoading(false)
    }

    init()
  }, []) // Roda só uma vez ao montar

  async function signOut() {
    await supabase.auth.signOut()
    setPerfil(null)
    router.push('/login')
  }

  return (
    <AuthContext.Provider value={{ perfil, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
