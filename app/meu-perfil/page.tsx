'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'

export default function MeuPerfil() {
  const { perfil, signOut } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!perfil) return
    if (perfil.vertical === 'Medicina') {
      router.replace('/med/aluno')
    } else if (perfil.aluno_id) {
      router.replace(`/aluno/${perfil.aluno_id}`)
    }
  }, [perfil])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', color: '#999' }}>Carregando...</div>
    </div>
  )
}
