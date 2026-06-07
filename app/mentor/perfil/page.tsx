'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { dbQuery, dbUpdate } from '@/lib/supabase'
import Nav from '@/components/Nav'
import Link from 'next/link'
import {
  Clock, Users, BarChart2, Pencil, Check, X,
  LogOut, ExternalLink, ChevronRight,
} from 'lucide-react'

const CRITERIOS = [
  { key: 'qualidade_atendimento', label: 'Qualidade' },
  { key: 'organizacao_planejamento', label: 'Organização' },
  { key: 'diferencial_mentoria', label: 'Diferencial' },
  { key: 'clareza_orientacoes', label: 'Clareza' },
  { key: 'acompanhamento_cobranca', label: 'Acompanhamento' },
  { key: 'comunicacao_relacao', label: 'Comunicação' },
]

function mediaArr(respostas: any[], campo: string) {
  const vals = respostas.map(r => Number(r[campo])).filter(v => v > 0)
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
}

function mediaGeral(respostas: any[]) {
  const ms = CRITERIOS.map(c => mediaArr(respostas, c.key)).filter(v => v > 0)
  return ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : 0
}

function corCSAT(m: number) {
  return m > 4.5 ? '#16A34A' : m >= 4.0 ? '#D97706' : '#DC2626'
}

function corNota(m: number) {
  return m >= 7 ? '#16A34A' : m >= 4 ? '#f97316' : '#DC2626'
}

function calcMedia(r: any) {
  return r.media_2fase != null
    ? (Number(r.media_1fase || 0) + Number(r.media_2fase)) / 2
    : Number(r.media_1fase || 0)
}

export default function MentorPerfil() {
  const { perfil: meuPerfil, signOut } = useAuth()
  const router = useRouter()

  const [alunos, setAlunos] = useState<any[]>([])
  const [atendStats, setAtendStats] = useState({ sessoes: 0, horas: 0 })
  const [csatRespostas, setCsatRespostas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [editando, setEditando] = useState(false)
  const [nomeEdit, setNomeEdit] = useState('')
  const [savingNome, setSavingNome] = useState(false)

  useEffect(() => {
    if (!meuPerfil?.mentor_nome) return
    carregar()
  }, [meuPerfil])

  async function carregar() {
    const [
      { data: alDados },
      { data: rankingsD },
      { data: atendD },
      { data: respostasD },
    ] = await Promise.all([
      dbQuery('alunos_dados', { mentor: `eq.${meuPerfil!.mentor_nome!}`, order: 'nome' }, 'id_aluno,nome'),
      dbQuery('resultados',
        { mentor: `eq.${meuPerfil!.mentor_nome!}`, fase: 'eq.ranking', order: 'ciclo_nome.desc' },
        'id_aluno,ciclo_nome,resultado_ciclo,media_1fase,media_2fase'
      ),
      dbQuery('atendimentos_mentoria', { mentor: `eq.${meuPerfil!.mentor_nome!}` }, 'duracao_minutos'),
      dbQuery('respostas_csat', { mentor: `eq.${meuPerfil!.mentor_nome!}` }),
    ])

    const atList = atendD || []
    setAtendStats({
      sessoes: atList.length,
      horas: Math.round(atList.reduce((a: number, d: any) => a + (d.duracao_minutos || 0), 0) / 60),
    })

    setCsatRespostas(respostasD || [])

    const latestMap: Record<string, any> = {}
    ;(rankingsD || []).forEach((r: any) => {
      if (!latestMap[r.id_aluno]) latestMap[r.id_aluno] = r
    })
    setAlunos((alDados || []).map((a: any) => ({ ...a, resultado: latestMap[a.id_aluno] || null })))

    setLoading(false)
  }

  async function salvarNome() {
    if (!nomeEdit.trim() || !meuPerfil?.id) return
    setSavingNome(true)
    await dbUpdate('perfis', { id: `eq.${meuPerfil.id}` }, { nome: nomeEdit.trim() })
    setSavingNome(false)
    setEditando(false)
    window.location.reload()
  }

  const nome = meuPerfil?.nome || meuPerfil?.mentor_nome || ''
  const iniciais = nome.split(' ').map((w: string) => w[0]).slice(0, 2).join('')
  const csatMedia = csatRespostas.length ? mediaGeral(csatRespostas) : null

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>Carregando...</div>

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999', lineHeight: 1 }}>←</button>
        <div style={{ fontSize: 17, fontWeight: 600, flex: 1 }}>Meu Perfil</div>
        <button
          onClick={signOut}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '0.5px solid rgba(220,38,38,0.3)', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer', color: '#DC2626', fontFamily: 'DM Sans, sans-serif' }}
        >
          <LogOut size={13} strokeWidth={2} /> Sair
        </button>
      </div>

      <div style={{ padding: 16 }}>

        {/* Profile card */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, color: '#1E40AF', flexShrink: 0 }}>
              {iniciais}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {editando ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    value={nomeEdit}
                    onChange={e => setNomeEdit(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && salvarNome()}
                    autoFocus
                    style={{ flex: 1, fontSize: 14, fontWeight: 600, padding: '6px 10px', borderRadius: 8, border: '1.5px solid #f97316', fontFamily: 'DM Sans, sans-serif', outline: 'none', minWidth: 0 }}
                  />
                  <button onClick={salvarNome} disabled={savingNome} style={{ background: '#f97316', border: 'none', borderRadius: 8, padding: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    <Check size={14} color="white" strokeWidth={2.5} />
                  </button>
                  <button onClick={() => setEditando(false)} style={{ background: '#F1F5F9', border: 'none', borderRadius: 8, padding: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    <X size={14} color="#666" strokeWidth={2} />
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nome}</div>
                  <button onClick={() => { setNomeEdit(nome); setEditando(true) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', padding: 2, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    <Pencil size={13} strokeWidth={2} />
                  </button>
                </div>
              )}
              <div style={{ fontSize: 12, color: '#999', marginTop: 3 }}>Mentor</div>
            </div>
          </div>

          {/* Estatísticas de carreira */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div style={{ textAlign: 'center', background: '#fff7ed', borderRadius: 12, padding: '10px 8px' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 3 }}>
                <BarChart2 size={15} color="#f97316" strokeWidth={2} />
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#f97316' }}>{atendStats.sessoes}</div>
              <div style={{ fontSize: 10, color: '#64748B' }}>sessões</div>
            </div>
            <div style={{ textAlign: 'center', background: '#F3F0FF', borderRadius: 12, padding: '10px 8px' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 3 }}>
                <Clock size={15} color="#f97316" strokeWidth={2} />
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#f97316' }}>{atendStats.horas}h</div>
              <div style={{ fontSize: 10, color: '#64748B' }}>de mentoria</div>
            </div>
            <div style={{ textAlign: 'center', background: '#F0FDF4', borderRadius: 12, padding: '10px 8px' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 3 }}>
                <Users size={15} color="#16A34A" strokeWidth={2} />
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#16A34A' }}>{alunos.length}</div>
              <div style={{ fontSize: 10, color: '#64748B' }}>alunos</div>
            </div>
          </div>
        </div>

        {/* CSAT */}
        {csatMedia !== null && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Satisfação dos alunos</div>
              <Link
                href={`/csat/mentor/${encodeURIComponent(meuPerfil!.mentor_nome!)}`}
                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#f97316', textDecoration: 'none' }}
              >
                Ver completo <ExternalLink size={11} strokeWidth={2} />
              </Link>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
              <div style={{ textAlign: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: 40, fontWeight: 800, color: corCSAT(csatMedia), lineHeight: 1 }}>{csatMedia.toFixed(1)}</div>
                <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>{csatRespostas.length} aval.</div>
              </div>
              <div style={{ flex: 1 }}>
                {CRITERIOS.map(c => {
                  const m = mediaArr(csatRespostas, c.key)
                  if (!m) return null
                  return (
                    <div key={c.key} style={{ marginBottom: 7 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 2 }}>
                        <span style={{ color: '#666' }}>{c.label}</span>
                        <span style={{ fontWeight: 700, color: corCSAT(m) }}>{m.toFixed(1)}</span>
                      </div>
                      <div style={{ height: 5, background: '#F1F5F9', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(m / 5) * 100}%`, background: corCSAT(m), borderRadius: 3, transition: 'width 0.5s' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <Link
              href={`/csat/mentor/${encodeURIComponent(meuPerfil!.mentor_nome!)}`}
              style={{ textDecoration: 'none' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 10, background: '#F8FAFC', border: '0.5px solid rgba(0,0,0,0.08)', fontSize: 13, color: '#f97316', fontWeight: 500 }}>
                Radar, evolução e feedbacks <ChevronRight size={14} strokeWidth={2} />
              </div>
            </Link>
          </div>
        )}

        {/* Meus alunos */}
        <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
          Meus alunos · {alunos.length}
        </div>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {alunos.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#999', padding: 32, fontSize: 13 }}>Nenhum aluno atribuído.</div>
          ) : alunos.map((a, i) => {
            const res = a.resultado
            const media = res ? calcMedia(res) : null
            const aprovado = res?.resultado_ciclo === 'Aprovado'
            const reprovado = res?.resultado_ciclo === 'Reprovado'
            return (
              <Link key={a.id_aluno} href={`/aluno/${a.id_aluno}`} style={{ textDecoration: 'none' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px',
                  borderBottom: i < alunos.length - 1 ? '0.5px solid rgba(0,0,0,0.06)' : 'none',
                  background: reprovado ? '#FFF8F8' : 'transparent',
                }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#1E40AF', flexShrink: 0 }}>
                    {a.nome.split(' ').map((w: string) => w[0]).slice(0, 2).join('')}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nome}</div>
                    {res && (
                      <div style={{ fontSize: 10, color: '#999', marginTop: 1 }}>
                        {String(res.ciclo_nome).replace('Ciclo ', 'C').replace(' - ITA', '').replace(' - IME', '')}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {media !== null && media > 0 && (
                      <span style={{ fontSize: 15, fontWeight: 700, color: corNota(media) }}>{media.toFixed(1)}</span>
                    )}
                    {res?.resultado_ciclo ? (
                      <span style={{
                        fontSize: 9, padding: '2px 7px', borderRadius: 8, fontWeight: 600,
                        background: aprovado ? '#DCFCE7' : reprovado ? '#FEF2F2' : '#F1F5F9',
                        color: aprovado ? '#14532D' : reprovado ? '#991B1B' : '#64748B',
                      }}>
                        {aprovado ? 'Aprov.' : reprovado ? 'Reprov.' : res.resultado_ciclo}
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, color: '#bbb' }}>sem dados</span>
                    )}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

      </div>
      <Nav />
    </div>
  )
}
