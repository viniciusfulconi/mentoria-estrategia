'use client'
import { useAuth } from '@/contexts/AuthContext'
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { dbQuery } from '@/lib/supabase'

export default function MeuCronograma() {
  const { perfil } = useAuth()
  const router = useRouter()
  const buscando = useRef(false)

  useEffect(() => {
    if (!perfil) return

    if (perfil.aluno_id) {
      router.replace(`/cronograma/${perfil.aluno_id}`)
      return
    }

    // Fallback por email para alunos de Medicina sem aluno_id no perfil
    if (perfil.papel === 'aluno' && perfil.vertical === 'Medicina' && !buscando.current) {
      buscando.current = true
      dbQuery('alunos', { email: `eq.${perfil.email}`, vertical: 'eq.Medicina' }, 'id')
        .then(({ data }) => {
          if (data?.[0]?.id) router.replace(`/cronograma/${data[0].id}`)
        })
    }
  }, [perfil])

  return <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>Carregando...</div>
}
