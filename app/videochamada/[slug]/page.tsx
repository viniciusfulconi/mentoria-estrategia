'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import dynamic from 'next/dynamic'
import { ArrowLeft, Video, Loader2 } from 'lucide-react'
import { dbQuery } from '@/lib/supabase'

const DailyCall = dynamic(() => import('@/components/DailyCall'), { ssr: false })

type RoomInfo = { room_url: string; token: string }

export default function VideoChamadaPage() {
  const params = useParams()
  const router = useRouter()
  const { perfil, loading: authLoading } = useAuth()
  const slug = params?.slug as string  // ex: "mentoria-952435ff"

  const [nomeAluno, setNomeAluno] = useState('')
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null)
  const [erro, setErro] = useState('')
  const [preparando, setPreparando] = useState(false)
  const [entrou, setEntrou] = useState(false)

  // Extrai aluno_id do slug
  const alunoId = slug?.replace('mentoria-', '') || ''

  // Busca nome do aluno para exibir
  useEffect(() => {
    if (!alunoId) return
    dbQuery('resultados', { id_aluno: `eq.${alunoId}`, fase: 'eq.ranking', limit: '1' }, 'nome_aluno')
      .then(({ data }) => { if (data?.[0]?.nome_aluno) setNomeAluno(data[0].nome_aluno) })
    // Para alunos Medicina, busca na tabela alunos
    dbQuery('alunos', { id: `eq.${alunoId}` }, 'nome')
      .then(({ data }) => { if (data?.[0]?.nome && !nomeAluno) setNomeAluno(data[0].nome) })
  }, [alunoId])

  async function entrarNaChamada() {
    if (!perfil) return
    setPreparando(true)
    setErro('')
    try {
      const resp = await fetch('/api/videochamada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aluno_id: alunoId,
          user_name: perfil.nome,
          papel: perfil.papel,
          notificar: true,
        }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Erro ao criar sala')
      setRoomInfo(data)
      setEntrou(true)
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setPreparando(false)
    }
  }

  if (authLoading) return (
    <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
      Carregando...
    </div>
  )

  const papel = perfil?.papel
  const isOwner = papel === 'mentor' || papel === 'coordenador' || papel === 'direcao'

  // ── Tela de prévia ───────────────────────────────────────────────────────
  if (!entrou) {
    return (
      <div style={{
        height: '100dvh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f2554 0%, #0a1a3a 100%)',
        padding: 24, gap: 24,
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'rgba(249,115,22,0.2)',
          border: '2px solid rgba(249,115,22,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Video size={32} color="#f97316" strokeWidth={1.5} />
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'white', marginBottom: 6 }}>
            Videochamada
          </div>
          {nomeAluno && (
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>
              {isOwner ? `com ${nomeAluno}` : 'com seu mentor'}
            </div>
          )}
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.07)', borderRadius: 14,
          padding: '14px 20px', textAlign: 'center',
          border: '1px solid rgba(255,255,255,0.1)',
        }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Entrando como</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'white' }}>{perfil?.nome || '—'}</div>
        </div>

        {erro && (
          <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: '#fca5a5', maxWidth: 300, textAlign: 'center' }}>
            {erro}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 300 }}>
          <button
            onClick={entrarNaChamada}
            disabled={preparando}
            style={{
              padding: '14px 0', borderRadius: 12,
              background: preparando ? 'rgba(249,115,22,0.5)' : '#f97316',
              color: 'white', border: 'none',
              fontSize: 15, fontWeight: 700, cursor: preparando ? 'default' : 'pointer',
              fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: preparando ? 'none' : '0 4px 20px rgba(249,115,22,0.4)',
            }}
          >
            {preparando
              ? <><Loader2 size={16} strokeWidth={2} style={{ animation: 'spin 1s linear infinite' }} /> Preparando sala...</>
              : 'Entrar na chamada'}
          </button>
          <button
            onClick={() => router.back()}
            style={{
              padding: '12px 0', borderRadius: 12,
              background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)',
              border: '1px solid rgba(255,255,255,0.12)',
              fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Voltar
          </button>
        </div>

        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // ── Chamada ativa ────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 14px', height: 44, flexShrink: 0,
        background: '#0f2554', borderBottom: '1px solid rgba(255,255,255,0.06)',
        zIndex: 10,
      }}>
        <button
          onClick={() => { setEntrou(false); setRoomInfo(null) }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,0.5)', fontSize: 12, fontFamily: 'inherit',
            padding: '4px 8px', borderRadius: 6,
          }}
        >
          <ArrowLeft size={14} strokeWidth={2} /> Sair
        </button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'white' }}>
          {nomeAluno || 'Videochamada'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e' }} />
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>ao vivo</span>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {roomInfo && <DailyCall roomUrl={roomInfo.room_url} token={roomInfo.token} />}
      </div>
    </div>
  )
}
