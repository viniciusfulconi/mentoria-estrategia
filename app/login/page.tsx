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
      const { data: { user } } = await supabase.auth.getUser()
      const { data } = await supabase.from('perfis').select('papel,status').eq('id', user?.id || '').single()
      if (data?.status === 'pendente') router.push('/aguardando')
      else if (data?.papel === 'coordenador') router.push('/')
      else if (data?.papel === 'mentor') router.push('/mentor')
      else if (data?.papel === 'aluno') router.push('/meu-perfil')
      else router.push('/')
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'row' }}>

      {/* LADO ESQUERDO — Coruja */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(160deg, #0A1628 0%, #0D2147 50%, #0A3060 100%)',
        padding: '40px 32px', position: 'relative', overflow: 'hidden',
        minHeight: '100vh',
      }}>
        {/* Círculos decorativos */}
        <div style={{ position: 'absolute', width: 400, height: 400, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.05)', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
        <div style={{ position: 'absolute', width: 600, height: 600, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.03)', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
        <div style={{ position: 'absolute', width: 200, height: 200, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.07)', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />

        {/* Brilho sutil atrás da coruja */}
        <div style={{
          position: 'absolute', width: 320, height: 320, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(83,74,183,0.3) 0%, transparent 70%)',
          top: '50%', left: '50%', transform: 'translate(-50%, -55%)'
        }} />

        {/* Coruja */}
        <img
          src="/coruja.png"
          alt="Estratégia Concursos"
          style={{ width: 200, height: 200, objectFit: 'contain', position: 'relative', zIndex: 1, marginBottom: 32, filter: 'drop-shadow(0 0 40px rgba(100,150,255,0.4))' }}
        />

        {/* Texto */}
        <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'white', letterSpacing: '-0.5px', marginBottom: 8 }}>
            Mentoria
          </div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Estratégia Concursos
          </div>
        </div>

        {/* Tagline */}
        <div style={{ position: 'absolute', bottom: 32, textAlign: 'center', zIndex: 1 }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.05em' }}>
            ITA · IME · Medicina
          </div>
        </div>
      </div>

      {/* LADO DIREITO — Formulário */}
      <div style={{
        width: '420px', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#F7F6F3', padding: '40px 36px',
        minHeight: '100vh',
      }}>
        <div style={{ width: '100%', maxWidth: 340 }}>
          <div style={{ marginBottom: 36 }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#1a1a1a', marginBottom: 6 }}>Bem-vindo 👋</div>
            <div style={{ fontSize: 14, color: '#999' }}>Entre com sua conta para continuar</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#555', display: 'block', marginBottom: 6 }}>E-mail</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                onKeyDown={e => e.key === 'Enter' && entrar()}
                style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1.5px solid rgba(0,0,0,0.1)', background: 'white', color: '#1a1a1a', fontSize: 14, fontFamily: 'DM Sans, sans-serif', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
                onFocus={e => e.target.style.borderColor = '#534AB7'}
                onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,0.1)'}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#555', display: 'block', marginBottom: 6 }}>Senha</label>
              <input
                type="password"
                value={senha}
                onChange={e => setSenha(e.target.value)}
                placeholder="••••••••"
                onKeyDown={e => e.key === 'Enter' && entrar()}
                style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1.5px solid rgba(0,0,0,0.1)', background: 'white', color: '#1a1a1a', fontSize: 14, fontFamily: 'DM Sans, sans-serif', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
                onFocus={e => e.target.style.borderColor = '#534AB7'}
                onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,0.1)'}
              />
            </div>

            {erro && (
              <div style={{ background: '#FCEBEB', color: '#791F1F', fontSize: 13, padding: '10px 14px', borderRadius: 10 }}>
                {erro}
              </div>
            )}

            <button
              onClick={entrar}
              disabled={loading}
              style={{
                width: '100%', padding: '13px', borderRadius: 12,
                background: loading ? '#aaa' : '#534AB7',
                color: 'white', border: 'none', fontSize: 15,
                fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'DM Sans, sans-serif', marginTop: 4,
                transition: 'opacity 0.15s',
              }}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </div>

          <div style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: '#999' }}>
            Não tem conta?{' '}
            <Link href="/cadastro" style={{ color: '#534AB7', fontWeight: 600, textDecoration: 'none' }}>
              Cadastre-se
            </Link>
          </div>
        </div>
      </div>

      {/* MOBILE — esconde o lado esquerdo em telas pequenas */}
      <style>{`
        @media (max-width: 640px) {
          div[data-left] { display: none !important; }
          div[data-right] { width: 100% !important; }
        }
      `}</style>
    </div>
  )
}
