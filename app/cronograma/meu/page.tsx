'use client'
import { useAuth } from '@/contexts/AuthContext'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function MeuCronograma() {
  const { perfil } = useAuth()
  const router = useRouter()
  useEffect(() => {
    if (perfil?.aluno_id) router.replace(`/cronograma/${perfil.aluno_id}`)
  }, [perfil])
  return <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>Carregando...</div>
}
