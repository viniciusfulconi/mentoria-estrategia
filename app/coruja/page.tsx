'use client'
import { useState, useRef, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getToken } from '@/lib/supabase'
import Nav from '@/components/Nav'
import { Send, Bot, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'

type Mensagem = {
  role: 'user' | 'assistant'
  content: string
  sql?: string | null
  linhas?: number
}

function BotAvatar() {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
      background: 'var(--purple-light)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <Bot size={17} color="var(--purple)" strokeWidth={2} />
    </div>
  )
}

function SqlBlock({ sql, linhas }: { sql: string; linhas?: number }) {
  const [aberto, setAberto] = useState(false)
  return (
    <div style={{ marginTop: 10 }}>
      <button
        onClick={() => setAberto(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-hint)', fontSize: 11, padding: 0,
          fontFamily: 'DM Sans, sans-serif',
        }}
      >
        {aberto ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        Ver SQL gerado
        {linhas !== undefined && (
          <span style={{
            marginLeft: 4, background: 'var(--purple-light)', color: 'var(--purple)',
            borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 600,
          }}>
            {linhas} {linhas === 1 ? 'linha' : 'linhas'}
          </span>
        )}
      </button>
      {aberto && (
        <pre style={{
          marginTop: 6, padding: '10px 12px', borderRadius: 8,
          background: '#1e1e2e', color: '#cdd6f4',
          fontSize: 11.5, lineHeight: 1.6, overflowX: 'auto',
          fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>
          {sql}
        </pre>
      )}
    </div>
  )
}

function MensagemBubble({ msg }: { msg: Mensagem }) {
  const isBot = msg.role === 'assistant'
  return (
    <div style={{
      display: 'flex', gap: 10,
      flexDirection: isBot ? 'row' : 'row-reverse',
      alignItems: 'flex-start',
      maxWidth: '100%',
    }}>
      {isBot && <BotAvatar />}
      <div style={{
        maxWidth: 'min(640px, 82%)',
        background: isBot ? 'white' : 'var(--purple)',
        color: isBot ? 'var(--text)' : 'white',
        borderRadius: isBot ? '0 16px 16px 16px' : '16px 0 16px 16px',
        padding: '12px 16px',
        fontSize: 14, lineHeight: 1.65,
        boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
        border: isBot ? '1px solid var(--border)' : 'none',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {msg.content}
        {isBot && msg.sql && <SqlBlock sql={msg.sql} linhas={msg.linhas} />}
      </div>
    </div>
  )
}

const SUGESTOES = [
  'Qual aluno tem a maior média geral?',
  'Quantos atendimentos foram feitos este mês?',
  'Qual é a nota média de matemática no Ciclo 4?',
  'Quais alunos estão reprovados no último ciclo?',
]

export default function CorujaPage() {
  const { perfil, loading } = useAuth()
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [input, setInput] = useState('')
  const [enviando, setEnviando] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens])

  if (loading) return null
  if (perfil?.papel !== 'coordenador' && perfil?.papel !== 'direcao') {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
        <Nav />
        <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
            <Bot size={40} strokeWidth={1.5} style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: 15 }}>Acesso restrito a coordenadores.</div>
          </div>
        </main>
      </div>
    )
  }

  async function enviar(texto?: string) {
    const pergunta = (texto ?? input).trim()
    if (!pergunta || enviando) return

    const token = getToken()
    if (!token) return

    const novaMensagemUsuario: Mensagem = { role: 'user', content: pergunta }
    const historicoAtual = [...mensagens]
    setMensagens(prev => [...prev, novaMensagemUsuario])
    setInput('')
    setEnviando(true)

    const historico = historicoAtual.map(m => ({
      role: m.role,
      content: m.content,
    }))

    try {
      const resp = await fetch('/api/coruja', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pergunta, historico, token }),
      })
      const data = await resp.json()
      if (!resp.ok) {
        const errMsg = typeof data.error === 'string' ? data.error : JSON.stringify(data.error) ?? 'Falha ao obter resposta.'
        setMensagens(prev => [...prev, { role: 'assistant', content: `Erro: ${errMsg}` }])
      } else {
        setMensagens(prev => [...prev, {
          role: 'assistant',
          content: data.resposta,
          sql: data.sql,
          linhas: data.linhas,
        }])
      }
    } catch {
      setMensagens(prev => [...prev, { role: 'assistant', content: 'Erro de conexão. Tente novamente.' }])
    } finally {
      setEnviando(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviar()
    }
  }

  const vazio = mensagens.length === 0

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      <Nav />
      <main style={{
        flex: 1,
        display: 'flex', flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px 14px',
          borderBottom: '1px solid var(--border)',
          background: 'white',
          display: 'flex', alignItems: 'center', gap: 12,
          flexShrink: 0,
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: '50%',
            background: 'var(--purple-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Bot size={20} color="var(--purple)" strokeWidth={2} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Coruja Inteligente</div>
            <div style={{ fontSize: 12, color: 'var(--text-hint)' }}>Faça perguntas sobre os dados da plataforma</div>
          </div>
        </div>

        {/* Área de mensagens */}
        <div style={{
          flex: 1, overflowY: 'auto',
          padding: '20px 16px',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          {vazio && (
            <div style={{ margin: 'auto', textAlign: 'center', maxWidth: 480 }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: 'var(--purple-light)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 20px',
              }}>
                <Bot size={32} color="var(--purple)" strokeWidth={1.5} />
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
                Olá! Sou a Coruja.
              </div>
              <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 28 }}>
                Faça qualquer pergunta sobre alunos, simulados, atendimentos ou avaliações. Consulto os dados reais da plataforma e respondo em linguagem natural.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {SUGESTOES.map(s => (
                  <button
                    key={s}
                    onClick={() => enviar(s)}
                    style={{
                      padding: '10px 16px', borderRadius: 12,
                      border: '1px solid var(--border)', background: 'white',
                      color: 'var(--text)', fontSize: 13, cursor: 'pointer',
                      textAlign: 'left', fontFamily: 'DM Sans, sans-serif',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--purple-light)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'white' }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mensagens.map((msg, i) => (
            <MensagemBubble key={i} msg={msg} />
          ))}

          {enviando && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <BotAvatar />
              <div style={{
                background: 'white', border: '1px solid var(--border)',
                borderRadius: '0 16px 16px 16px',
                padding: '12px 16px',
                display: 'flex', alignItems: 'center', gap: 8,
                color: 'var(--text-muted)', fontSize: 13,
              }}>
                <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                Consultando dados…
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{
          padding: '12px 16px 16px',
          background: 'white',
          borderTop: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{
            display: 'flex', gap: 10, alignItems: 'flex-end',
            background: 'var(--bg)', borderRadius: 16,
            border: '1px solid var(--border)', padding: '8px 8px 8px 14px',
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pergunte sobre os dados da plataforma…"
              rows={1}
              style={{
                flex: 1, border: 'none', background: 'transparent', resize: 'none',
                fontSize: 14, lineHeight: 1.5, color: 'var(--text)',
                fontFamily: 'DM Sans, sans-serif', outline: 'none',
                maxHeight: 120, overflowY: 'auto',
              }}
              onInput={e => {
                const el = e.currentTarget
                el.style.height = 'auto'
                el.style.height = `${Math.min(el.scrollHeight, 120)}px`
              }}
            />
            <button
              onClick={() => enviar()}
              disabled={!input.trim() || enviando}
              style={{
                width: 36, height: 36, borderRadius: 10,
                background: input.trim() && !enviando ? 'var(--purple)' : 'var(--border)',
                border: 'none', cursor: input.trim() && !enviando ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s', flexShrink: 0,
              }}
            >
              <Send size={16} color="white" strokeWidth={2} />
            </button>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-hint)', textAlign: 'center', marginTop: 6 }}>
            Enter para enviar · Shift+Enter para nova linha
          </div>
        </div>
      </main>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}
