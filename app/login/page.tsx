'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  async function entrar() {
    if (!email || !senha) { setErro('Preencha e-mail e senha.'); return }
    setLoading(true); setErro('')
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) { setErro('E-mail ou senha incorretos.'); setLoading(false) }
    else {
      const { data } = await supabase.from('perfis').select('papel,status').eq('id', (await supabase.auth.getUser()).data.user?.id || '').single()
      if (data?.status === 'pendente') router.push('/aguardando')
      else if (data?.papel === 'coordenador') router.push('/')
      else if (data?.papel === 'mentor') router.push('/mentor')
      else if (data?.papel === 'aluno') router.push('/meu-perfil')
      else router.push('/')
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#F7F6F3' }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#534AB7' }}>Mentoria</div>
          <div style={{ fontSize: 13, color: '#999', marginTop: 4 }}>Estratégia Concursos</div>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label>E-mail</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" onKeyDown={e => e.key === 'Enter' && entrar()} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label>Senha</label>
            <input type="password" value={senha} onChange={e => setSenha(e.target.value)} placeholder="••••••••" onKeyDown={e => e.key === 'Enter' && entrar()} />
          </div>
          {erro && <div style={{ color: '#E24B4A', fontSize: 13, marginBottom: 12 }}>{erro}</div>}
          <button className="btn-primary" onClick={entrar} disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: '#999' }}>
          Não tem conta?{' '}
          <Link href="/cadastro" style={{ color: '#534AB7', fontWeight: 500 }}>Cadastre-se</Link>
        </div>
      </div>
    </div>
  )
}
