'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
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
      <path d="M56 44 L60 50 L64 44Z" fill="#EF9F27"/>
      <path d="M30 22 Q60 8 90 22" fill="none" stroke="#B8C8F0" strokeWidth="3" strokeLinecap="round"/>
      <path d="M48 108 L44 116 M48 108 L50 116 M48 108 L46 116" stroke="#EF9F27" strokeWidth="2" strokeLinecap="round"/>
      <path d="M72 108 L68 116 M72 108 L74 116 M72 108 L70 116" stroke="#EF9F27" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

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
    <div style={{ minHeight: '100vh', display: 'flex' }}>

      {/* LADO ESQUERDO */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(160deg, #0A1628 0%, #0D2147 50%, #0A3060 100%)',
        padding: '40px 32px', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', width: 400, height: 400, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.05)', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
        <div style={{ position: 'absolute', width: 600, height: 600, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.03)', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
        <div style={{ position: 'absolute', width: 200, height: 200, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.07)', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
        <div style={{ position: 'absolute', width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(83,74,183,0.3) 0%, transparent 70%)', top: '50%', left: '50%', transform: 'translate(-50%, -55%)' }} />

        <div style={{ position: 'relative', zIndex: 1, marginBottom: 32 }}>
          <CorujaLogo size={180} />
        </div>

        <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'white', letterSpacing: '-0.5px', marginBottom: 8 }}>Mentoria</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Estratégia Concursos</div>
        </div>

        <div style={{ position: 'absolute', bottom: 28, textAlign: 'center', zIndex: 1 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.06em' }}>ITA · IME · Medicina</div>
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
              <div style={{ background: '#FCEBEB', color: '#791F1F', fontSize: 13, padding: '10px 14px', borderRadius: 10 }}>{erro}</div>
            )}

            <button onClick={entrar} disabled={loading} style={{
              width: '100%', padding: '13px', borderRadius: 12,
              background: loading ? '#aaa' : '#534AB7', color: 'white',
              border: 'none', fontSize: 15, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'DM Sans, sans-serif', marginTop: 4,
            }}>
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </div>

          <div style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: '#999' }}>
            Não tem conta?{' '}
            <Link href="/cadastro" style={{ color: '#534AB7', fontWeight: 600, textDecoration: 'none' }}>Cadastre-se</Link>
          </div>
        </div>
      </div>

      <style>{`@media (max-width: 640px) { .left-panel { display: none !important; } .right-panel { width: 100% !important; } }`}</style>
    </div>
  )
}
