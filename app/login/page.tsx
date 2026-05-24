'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

function CorujaLogo({ size = 160 }: { size?: number }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} style={{ filter: 'drop-shadow(0 0 28px rgba(100,150,255,0.4))' }}>
      <ellipse cx="60" cy="72" rx="32" ry="38" fill="#E8F0FF" opacity="0.95"/>
      <ellipse cx="60" cy="38" rx="30" ry="28" fill="#E8F0FF" opacity="0.95"/>
      <path d="M28 65 Q18 80 22 95 Q35 88 40 72Z" fill="#B8C8F0" opacity="0.9"/>
      <path d="M92 65 Q102 80 98 95 Q85 88 80 72Z" fill="#B8C8F0" opacity="0.9"/>
      <ellipse cx="60" cy="82" rx="18" ry="22" fill="#D0DCF8" opacity="0.7"/>
      <circle cx="46" cy="36" r="11" fill="#1A2E5A"/>
      <circle cx="74" cy="36" r="11" fill="#1A2E5A"/>
      <circle cx="46" cy="36" r="7" fill="#2A4A8A"/>
      <circle cx="74" cy="36" r="7" fill="#2A4A8A"/>
      <circle cx="46" cy="36" r="4" fill="#0A1628"/>
      <circle cx="74" cy="36" r="4" fill="#0A1628"/>
      <circle cx="48" cy="34" r="1.5" fill="white" opacity="0.8"/>
      <circle cx="76" cy="34" r="1.5" fill="white" opacity="0.8"/>
      <path d="M56 44 L60 50 L64 44Z" fill="#D97706"/>
      <path d="M30 22 Q60 8 90 22" fill="none" stroke="#B8C8F0" strokeWidth="3" strokeLinecap="round"/>
      <path d="M48 108 L44 116 M48 108 L50 116 M48 108 L46 116" stroke="#D97706" strokeWidth="2" strokeLinecap="round"/>
      <path d="M72 108 L68 116 M72 108 L74 116 M72 108 L70 116" stroke="#D97706" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [recuperando, setRecuperando] = useState(false)
  const [emailRecuperacao, setEmailRecuperacao] = useState('')
  const [recuperacaoEnviada, setRecuperacaoEnviada] = useState(false)
  const [loadingRecuperacao, setLoadingRecuperacao] = useState(false)

  async function entrar() {
    if (!email || !senha) { setErro('Preencha e-mail e senha.'); return }
    setLoading(true); setErro('')
    try {
      // Usa REST direto para evitar lock do cliente JS quando há sessão travada
      const resp = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ email, password: senha }),
        }
      )
      if (!resp.ok) {
        setErro('E-mail ou senha incorretos.')
        setLoading(false)
        return
      }
      const data = await resp.json()
      // Armazena sessão diretamente e faz reload limpo (reinicializa o cliente JS)
      const ref = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace('https://', '').replace('.supabase.co', '')
      localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({
        access_token: data.access_token,
        token_type: data.token_type,
        expires_in: data.expires_in,
        expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
        refresh_token: data.refresh_token,
        user: data.user,
      }))
      window.location.href = '/'
    } catch {
      setErro('Erro ao conectar. Tente novamente.')
      setLoading(false)
    }
  }

  async function enviarRecuperacao() {
    if (!emailRecuperacao) return
    setLoadingRecuperacao(true)
    await supabase.auth.resetPasswordForEmail(emailRecuperacao, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setRecuperacaoEnviada(true)
    setLoadingRecuperacao(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', zIndex: 50 }}>

      {/* LADO ESQUERDO */}
      <div style={{
        flex: 1, position: 'relative', overflow: 'hidden',
        background: '#0A1628',
      }}>
        <img
          src="/login-bg.png"
          alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
        />
        <div style={{ position: 'absolute', bottom: 28, left: 0, right: 0, textAlign: 'center', zIndex: 1 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.06em' }}>Estratégia Concursos</div>
        </div>
      </div>

      {/* LADO DIREITO */}
      <div style={{
        width: '420px', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#F7F6F3', padding: '40px 36px',
      }}>
        <div style={{ width: '100%', maxWidth: 340 }}>
          <div style={{ marginBottom: 36 }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#1a1a1a', marginBottom: 6 }}>Bem-vindo 👋</div>
            <div style={{ fontSize: 14, color: '#999' }}>Entre com sua conta para continuar</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#555', display: 'block', marginBottom: 6 }}>E-mail</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com"
                onKeyDown={e => e.key === 'Enter' && entrar()}
                style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1.5px solid rgba(0,0,0,0.1)', background: 'white', color: '#1a1a1a', fontSize: 14, fontFamily: 'DM Sans, sans-serif', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#555', display: 'block', marginBottom: 6 }}>Senha</label>
              <input type="password" value={senha} onChange={e => setSenha(e.target.value)} placeholder="••••••••"
                onKeyDown={e => e.key === 'Enter' && entrar()}
                style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1.5px solid rgba(0,0,0,0.1)', background: 'white', color: '#1a1a1a', fontSize: 14, fontFamily: 'DM Sans, sans-serif', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {erro && (
              <div style={{ background: '#FEF2F2', color: '#991B1B', fontSize: 13, padding: '10px 14px', borderRadius: 10 }}>{erro}</div>
            )}

            <button onClick={entrar} disabled={loading} style={{
              width: '100%', padding: '13px', borderRadius: 12,
              background: loading ? '#aaa' : '#2563EB', color: 'white',
              border: 'none', fontSize: 15, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'DM Sans, sans-serif', marginTop: 4,
            }}>
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </div>

          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button
              onClick={() => { setRecuperando(v => !v); setRecuperacaoEnviada(false) }}
              style={{ background: 'none', border: 'none', fontSize: 13, color: '#2563EB', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
            >
              Esqueci minha senha
            </button>
          </div>

          {recuperando && (
            <div style={{ marginTop: 8, padding: '16px', background: 'white', borderRadius: 14, border: '1px solid rgba(0,0,0,0.08)' }}>
              {recuperacaoEnviada ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>✉</div>
                  <div style={{ fontSize: 13, color: '#1a1a1a', fontWeight: 500, marginBottom: 4 }}>E-mail enviado!</div>
                  <div style={{ fontSize: 12, color: '#999' }}>Verifique sua caixa de entrada e siga as instruções para redefinir sua senha.</div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 13, color: '#555', marginBottom: 10 }}>
                    Digite seu e-mail e enviaremos um link para redefinir sua senha.
                  </div>
                  <input
                    type="email"
                    value={emailRecuperacao}
                    onChange={e => setEmailRecuperacao(e.target.value)}
                    placeholder="seu@email.com"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid rgba(0,0,0,0.1)', background: '#F7F6F3', fontSize: 14, fontFamily: 'DM Sans, sans-serif', outline: 'none', boxSizing: 'border-box', marginBottom: 10 }}
                  />
                  <button
                    onClick={enviarRecuperacao}
                    disabled={loadingRecuperacao || !emailRecuperacao}
                    style={{ width: '100%', padding: '10px', borderRadius: 10, background: loadingRecuperacao || !emailRecuperacao ? '#aaa' : '#2563EB', color: 'white', border: 'none', fontSize: 14, fontWeight: 500, cursor: loadingRecuperacao || !emailRecuperacao ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}
                  >
                    {loadingRecuperacao ? 'Enviando...' : 'Enviar link'}
                  </button>
                </>
              )}
            </div>
          )}

          <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: '#999' }}>
            Não tem conta?{' '}
            <Link href="/cadastro" style={{ color: '#2563EB', fontWeight: 600, textDecoration: 'none' }}>Cadastre-se</Link>
          </div>
        </div>
      </div>

      <style>{`@media (max-width: 640px) { .left-panel { display: none !important; } .right-panel { width: 100% !important; } }`}</style>
    </div>
  )
}
