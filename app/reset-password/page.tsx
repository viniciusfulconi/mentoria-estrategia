'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

function comTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
  ])
}

export default function ResetPassword() {
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [pronto, setPronto] = useState(false)
  // Captura o hash sincronamente no render, antes do cliente JS processar/limpar
  const accessTokenRef = useRef<string | null>(
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.hash.substring(1)).get('access_token')
      : null
  )
  const router = useRouter()

  useEffect(() => {
    // Limpa o hash da URL se tinha token
    if (accessTokenRef.current) {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  async function salvarSenha() {
    if (!senha || senha.length < 6) { setErro('Senha deve ter ao menos 6 caracteres.'); return }
    if (senha !== confirmacao) { setErro('As senhas não coincidem.'); return }

    if (!accessTokenRef.current) {
      setErro('Link de recuperação inválido. Solicite um novo link.')
      return
    }

    setLoading(true)
    setErro('')

    try {
      // Chama a API REST diretamente — sem passar pelo cliente JS (evita mutex/lock)
      const resp = await comTimeout(
        fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessTokenRef.current}`,
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ password: senha }),
        }),
        12000,
        'Tempo esgotado. Verifique sua conexão e tente novamente.'
      )

      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        let serverMsg = text
        try { const j = JSON.parse(text); serverMsg = j.message || j.error_description || j.error || text } catch {}
        throw new Error(serverMsg || `Erro ${resp.status} ao salvar senha.`)
      }

      setPronto(true)
      setTimeout(() => router.push('/'), 2000)
    } catch (e: any) {
      setErro(e.message || 'Erro inesperado. Tente novamente.')
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#F7F6F3', padding: 24, fontFamily: 'DM Sans, sans-serif',
    }}>
      <div style={{
        width: '100%', maxWidth: 380, background: 'white',
        borderRadius: 20, padding: '36px 32px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      }}>
        {pronto ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Senha atualizada!</div>
            <div style={{ fontSize: 14, color: '#999' }}>Redirecionando...</div>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a', marginBottom: 6 }}>Redefinir senha</div>
              <div style={{ fontSize: 14, color: '#999' }}>Digite sua nova senha abaixo.</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: '#555', display: 'block', marginBottom: 6 }}>Nova senha</label>
                <input
                  type="password" value={senha} onChange={e => setSenha(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1.5px solid rgba(0,0,0,0.1)', background: '#F7F6F3', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'DM Sans, sans-serif' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: '#555', display: 'block', marginBottom: 6 }}>Confirmar senha</label>
                <input
                  type="password" value={confirmacao} onChange={e => setConfirmacao(e.target.value)}
                  placeholder="Repita a nova senha"
                  onKeyDown={e => e.key === 'Enter' && salvarSenha()}
                  style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1.5px solid rgba(0,0,0,0.1)', background: '#F7F6F3', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'DM Sans, sans-serif' }}
                />
              </div>

              {erro && (
                <div style={{ background: '#FEF2F2', color: '#991B1B', fontSize: 13, padding: '10px 14px', borderRadius: 10 }}>{erro}</div>
              )}

              <button
                onClick={salvarSenha}
                disabled={loading}
                style={{
                  width: '100%', padding: '13px', borderRadius: 12,
                  background: loading ? '#aaa' : '#f97316',
                  color: 'white', border: 'none', fontSize: 15, fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontFamily: 'DM Sans, sans-serif', marginTop: 4,
                }}
              >
                {loading ? 'Salvando...' : 'Salvar nova senha'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
