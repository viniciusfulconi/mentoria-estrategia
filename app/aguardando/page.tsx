'use client'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function Aguardando() {
  const router = useRouter()
  async function sair() {
    await supabase.auth.signOut()
    router.push('/login')
  }
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#F7F6F3' }}>
      <div style={{ textAlign: 'center', maxWidth: 320 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
        <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Aguardando aprovação</div>
        <div style={{ fontSize: 14, color: '#999', lineHeight: 1.6, marginBottom: 24 }}>
          Seu cadastro foi enviado! O coordenador irá aprovar seu acesso em breve. Você receberá uma confirmação por e-mail.
        </div>
        <button className="btn-secondary" onClick={sair}>Sair</button>
      </div>
    </div>
  )
}
