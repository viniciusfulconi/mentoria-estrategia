'use client'
import { useEffect, useState, useMemo } from 'react'
import { dbQuery, dbUpdate } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Nav from '@/components/Nav'
import Link from 'next/link'
import { UserPlus, Search, ChevronRight, Users, UserCheck, Clock, UserX } from 'lucide-react'

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  'Ativo':                           { label: 'Ativo',                   bg: '#dcfce7', color: '#166534' },
  'Ativo - Não optou pela mentoria': { label: 'Não optou',               bg: '#dbeafe', color: '#1e40af' },
  'Ativo - Sem contato':             { label: 'Sem contato',             bg: '#fef9c3', color: '#854d0e' },
  'Ativo - Sem resposta':            { label: 'Sem resposta',            bg: '#ede9fe', color: '#5b21b6' },
  'Inativo - Cancelou o curso':      { label: 'Cancelou',                bg: '#fee2e2', color: '#991b1b' },
}

// Avatar com cor determinística pela inicial
const AVATAR_COLORS = [
  ['#0f2554', '#1e3a8a'], ['#7c3aed', '#5b21b6'],
  ['#0891b2', '#0e7490'], ['#059669', '#065f46'],
  ['#b45309', '#92400e'], ['#be123c', '#9f1239'],
]
function avatarColor(nome: string): [string, string] {
  const idx = nome.charCodeAt(0) % AVATAR_COLORS.length
  return AVATAR_COLORS[idx] as [string, string]
}

type AlunoMed = {
  id: string; nome: string; email: string; telefone?: string
  modalidade?: string; status_aluno: string
  turma_id?: string; mentor_id?: string | null; mentor_aceite?: boolean | null
  turmas?: { nome: string }; mentores?: { nome: string; email?: string }
}
type Tab = 'todos' | 'sem-mentor' | 'pendentes' | 'com-mentor'

export default function AlunosMed() {
  const router = useRouter()
  const { perfil } = useAuth()
  const [alunos, setAlunos] = useState<AlunoMed[]>([])
  const [turmas, setTurmas] = useState<any[]>([])
  const [mentores, setMentores] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)
  const [tab, setTab] = useState<Tab>('todos')
  const [busca, setBusca] = useState('')
  const [filtroTurma, setFiltroTurma] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [encaminhandoId, setEncaminhandoId] = useState<string | null>(null)
  const [encaminhandoNome, setEncaminhandoNome] = useState('')
  const [mentorSelecionado, setMentorSelecionado] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (perfil && perfil.papel !== 'coordenador' && perfil.papel !== 'direcao') {
      router.replace('/'); return
    }
    carregar()
  }, [perfil])

  async function carregar() {
    setCarregando(true)
    const [{ data: a }, { data: t }, { data: m }] = await Promise.all([
      dbQuery<AlunoMed>('alunos', { vertical: 'eq.Medicina', order: 'nome' }, '*,turmas(nome),mentores(nome,email)'),
      dbQuery('turmas', { tipo: 'eq.Medicina', order: 'nome' }),
      dbQuery('mentores', { vertical: 'eq.Medicina', aceitando_alunos: 'eq.true', order: 'nome' }),
    ])
    setAlunos(a || [])
    setTurmas(t || [])
    setMentores(m || [])
    setCarregando(false)
  }

  const contagens = useMemo(() => ({
    semMentor: alunos.filter(a => !a.mentor_id).length,
    pendentes:  alunos.filter(a => a.mentor_id && a.mentor_aceite === null).length,
    comMentor:  alunos.filter(a => a.mentor_aceite === true).length,
  }), [alunos])

  const filtrados = useMemo(() => {
    let lista = alunos
    if (tab === 'sem-mentor') lista = lista.filter(a => !a.mentor_id)
    else if (tab === 'pendentes') lista = lista.filter(a => a.mentor_id && a.mentor_aceite === null)
    else if (tab === 'com-mentor') lista = lista.filter(a => a.mentor_aceite === true)
    if (busca) lista = lista.filter(a => a.nome.toLowerCase().includes(busca.toLowerCase()))
    if (filtroTurma) lista = lista.filter(a => a.turma_id === filtroTurma)
    if (filtroStatus) lista = lista.filter(a => a.status_aluno === filtroStatus)
    return lista
  }, [alunos, tab, busca, filtroTurma, filtroStatus])

  async function encaminhar() {
    if (!encaminhandoId || !mentorSelecionado) return
    setSalvando(true)
    await dbUpdate('alunos', { id: `eq.${encaminhandoId}` }, { mentor_id: mentorSelecionado, mentor_aceite: null })
    setSalvando(false)
    setEncaminhandoId(null)
    setMentorSelecionado('')
    carregar()
  }

  const TABS: { id: Tab; label: string; count: number; icon: React.ReactNode }[] = [
    { id: 'todos',      label: 'Todos',       count: alunos.length,     icon: <Users size={13} /> },
    { id: 'sem-mentor', label: 'Sem mentor',  count: contagens.semMentor, icon: <UserX size={13} /> },
    { id: 'pendentes',  label: 'Pendentes',   count: contagens.pendentes,  icon: <Clock size={13} /> },
    { id: 'com-mentor', label: 'Com mentor',  count: contagens.comMentor,  icon: <UserCheck size={13} /> },
  ]

  return (
    <div style={{ paddingBottom: 80, background: 'var(--bg)', minHeight: '100vh' }}>
      <Nav />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{
        background: 'white',
        borderBottom: '1px solid var(--border)',
        padding: '18px 20px',
        position: 'sticky', top: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.3px' }}>
            Alunos
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-hint)', marginTop: 1 }}>
            Medicina · {alunos.length} aluno{alunos.length !== 1 ? 's' : ''} cadastrado{alunos.length !== 1 ? 's' : ''}
          </div>
        </div>
        <Link href="/med/alunos/novo" style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          background: 'var(--primary)', color: 'white', textDecoration: 'none',
          padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700,
          boxShadow: '0 2px 8px rgba(249,115,22,0.35)',
          transition: 'background 0.15s, box-shadow 0.15s',
        }}>
          <UserPlus size={15} strokeWidth={2.5} />
          Novo aluno
        </Link>
      </div>

      {/* ── Stats cards ────────────────────────────────────────────────── */}
      {!carregando && (
        <div style={{ padding: '16px 16px 0', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          {[
            { label: 'Total',      value: alunos.length,          bg: '#eff6ff',  color: '#0f2554', icon: <Users size={16} /> },
            { label: 'Sem mentor', value: contagens.semMentor,    bg: '#fff7ed',  color: '#ea580c', icon: <UserX size={16} /> },
            { label: 'Pendentes',  value: contagens.pendentes,    bg: '#fefce8',  color: '#b45309', icon: <Clock size={16} /> },
            { label: 'Com mentor', value: contagens.comMentor,    bg: '#f0fdf4',  color: '#166534', icon: <UserCheck size={16} /> },
          ].map(s => (
            <div key={s.label} style={{
              background: 'white', borderRadius: 12, padding: '12px 14px',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-xs)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>{s.label}</span>
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: s.bg, color: s.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {s.icon}
                </div>
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <div style={{ background: 'white', borderBottom: '1px solid var(--border)', overflowX: 'auto', marginTop: 16 }}>
        <div style={{ display: 'flex', padding: '0 16px', minWidth: 'max-content' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: tab === t.id ? 700 : 400,
                color: tab === t.id ? 'var(--primary)' : 'var(--text-hint)',
                borderBottom: tab === t.id ? '2px solid var(--primary)' : '2px solid transparent',
                whiteSpace: 'nowrap', transition: 'color 0.15s',
                fontFamily: 'inherit',
              }}
            >
              {t.label}
              {t.count > 0 && (
                <span style={{
                  background: tab === t.id ? 'var(--primary)' : '#e2e8f0',
                  color: tab === t.id ? 'white' : 'var(--text-muted)',
                  fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                  lineHeight: 1.4,
                }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Filtros ────────────────────────────────────────────────────── */}
      <div style={{ padding: '12px 16px', background: 'white', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
            <Search size={14} color="var(--text-hint)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              placeholder="Buscar aluno..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              style={{
                width: '100%', padding: '9px 12px 9px 36px',
                borderRadius: 10, border: '1.5px solid var(--border-strong)',
                fontSize: 13, background: 'var(--bg)',
                outline: 'none', boxSizing: 'border-box',
                fontFamily: 'inherit', color: 'var(--text)',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = 'white' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.background = 'var(--bg)' }}
            />
          </div>
          <select
            value={filtroTurma}
            onChange={e => setFiltroTurma(e.target.value)}
            style={{
              padding: '9px 12px', borderRadius: 10,
              border: '1.5px solid var(--border-strong)',
              fontSize: 13, background: filtroTurma ? 'white' : 'var(--bg)',
              fontFamily: 'inherit', outline: 'none',
              color: filtroTurma ? 'var(--text)' : 'var(--text-hint)',
              fontWeight: filtroTurma ? 500 : 400,
            }}
          >
            <option value="">Todas as turmas</option>
            {turmas.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
          <select
            value={filtroStatus}
            onChange={e => setFiltroStatus(e.target.value)}
            style={{
              padding: '9px 12px', borderRadius: 10,
              border: '1.5px solid var(--border-strong)',
              fontSize: 13, background: filtroStatus ? 'white' : 'var(--bg)',
              fontFamily: 'inherit', outline: 'none',
              color: filtroStatus ? 'var(--text)' : 'var(--text-hint)',
              fontWeight: filtroStatus ? 500 : 400,
            }}
          >
            <option value="">Todos os status</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>

        {/* Filtros ativos */}
        {(busca || filtroTurma || filtroStatus) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>
              {filtrados.length} resultado{filtrados.length !== 1 ? 's' : ''}
            </span>
            <button
              onClick={() => { setBusca(''); setFiltroTurma(''); setFiltroStatus('') }}
              style={{
                fontSize: 11, color: 'var(--primary)', background: 'none', border: 'none',
                cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, padding: 0,
              }}
            >
              Limpar filtros
            </button>
          </div>
        )}
      </div>

      {/* ── Lista ──────────────────────────────────────────────────────── */}
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {carregando ? (
          /* Skeleton loading */
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{
              background: 'white', borderRadius: 14, padding: '16px',
              border: '1px solid var(--border)', boxShadow: 'var(--shadow-xs)',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton" style={{ height: 14, width: '55%', borderRadius: 6, marginBottom: 8 }} />
                <div className="skeleton" style={{ height: 11, width: '35%', borderRadius: 6 }} />
              </div>
            </div>
          ))
        ) : filtrados.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '56px 24px', background: 'white', borderRadius: 16, border: '1px solid var(--border)', marginTop: 4 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>
              {tab === 'sem-mentor' ? '🔍' : tab === 'pendentes' ? '⏳' : tab === 'com-mentor' ? '✅' : '👥'}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
              {tab === 'sem-mentor' ? 'Nenhum aluno sem mentor' :
               tab === 'pendentes' ? 'Nenhum aluno aguardando' :
               tab === 'com-mentor' ? 'Nenhum aluno com mentor' :
               busca ? 'Nenhum resultado' : 'Nenhum aluno cadastrado'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-hint)' }}>
              {tab === 'todos' && !busca
                ? 'Cadastre o primeiro aluno clicando em "Novo aluno".'
                : 'Tente ajustar os filtros.'}
            </div>
          </div>
        ) : filtrados.map(aluno => {
          const cfg = STATUS_CONFIG[aluno.status_aluno] || STATUS_CONFIG['Ativo']
          const semMentor = !aluno.mentor_id
          const pendente = aluno.mentor_id && aluno.mentor_aceite === null
          const [c1, c2] = avatarColor(aluno.nome)
          const iniciais = aluno.nome.split(' ').map((w: string) => w[0]).slice(0, 2).join('')

          return (
            <div key={aluno.id} style={{
              background: 'white', borderRadius: 14, padding: '14px 16px',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-sm)',
              display: 'flex', alignItems: 'center', gap: 12,
              transition: 'box-shadow 0.18s, transform 0.18s',
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; e.currentTarget.style.transform = 'translateY(0)' }}
            >
              {/* Avatar */}
              <div style={{
                width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                background: `linear-gradient(135deg, ${c1}, ${c2})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 800, color: 'white',
                letterSpacing: '-0.5px',
              }}>
                {iniciais}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {aluno.nome}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
                  <span style={{
                    background: cfg.bg, color: cfg.color,
                    fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 20,
                  }}>
                    {cfg.label}
                  </span>
                  {aluno.turmas?.nome && (
                    <span style={{ fontSize: 11, color: 'var(--text-hint)', background: '#f1f5f9', padding: '2px 8px', borderRadius: 20 }}>
                      {aluno.turmas.nome}
                    </span>
                  )}
                  {aluno.modalidade && (
                    <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>{aluno.modalidade}</span>
                  )}
                  {pendente && (
                    <span style={{
                      background: '#fefce8', color: '#b45309',
                      fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 20,
                      border: '1px solid rgba(180,83,9,0.15)',
                    }}>
                      ⏳ Aguardando
                    </span>
                  )}
                  {aluno.mentor_aceite === true && aluno.mentores?.nome && (
                    <span style={{ fontSize: 11, color: '#166534', background: '#f0fdf4', padding: '2px 8px', borderRadius: 20, fontWeight: 500 }}>
                      {aluno.mentores.nome}
                    </span>
                  )}
                </div>
              </div>

              {/* Ações */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {semMentor && (
                  <button
                    onClick={() => { setEncaminhandoId(aluno.id); setEncaminhandoNome(aluno.nome); setMentorSelecionado('') }}
                    style={{
                      padding: '7px 13px', borderRadius: 8,
                      border: '1.5px solid var(--primary)',
                      background: 'var(--primary-light)', color: 'var(--primary)',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      fontFamily: 'inherit', whiteSpace: 'nowrap',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#fde8d0'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--primary-light)'}
                  >
                    Encaminhar
                  </button>
                )}
                <Link href={`/med/alunos/${aluno.id}`} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 32, borderRadius: 8,
                  background: 'var(--bg)', color: 'var(--text-hint)',
                  textDecoration: 'none',
                  transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = 'var(--text)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.color = 'var(--text-hint)' }}
                >
                  <ChevronRight size={17} strokeWidth={2.5} />
                </Link>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Modal encaminhar ───────────────────────────────────────────── */}
      {encaminhandoId && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(9,30,66,0.55)',
            zIndex: 200, display: 'flex', alignItems: 'flex-end',
            backdropFilter: 'blur(2px)',
          }}
          onClick={e => { if (e.target === e.currentTarget) setEncaminhandoId(null) }}
        >
          <div style={{
            background: 'white', borderRadius: '20px 20px 0 0',
            width: '100%', padding: '0 0 32px',
            maxHeight: '82vh', overflowY: 'auto',
            boxShadow: '0 -8px 40px rgba(9,30,66,0.18)',
          }}>
            {/* Handle */}
            <div style={{ padding: '14px 20px 0', textAlign: 'center' }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: '#e2e8f0', margin: '0 auto 18px' }} />
            </div>

            {/* Cabeçalho */}
            <div style={{ padding: '0 20px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>
                Encaminhar aluno
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                <span style={{ fontWeight: 600, color: 'var(--text)' }}>{encaminhandoNome}</span>
                {' '}será encaminhado ao mentor selecionado para aceitação.
              </div>
            </div>

            {/* Lista de mentores */}
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {mentores.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--text-hint)', fontSize: 13 }}>
                  <div style={{ fontSize: 28, marginBottom: 10 }}>👤</div>
                  Nenhum mentor disponível no momento.
                </div>
              ) : mentores.map(m => {
                const sel = mentorSelecionado === m.id
                const [mc1, mc2] = avatarColor(m.nome)
                return (
                  <button
                    key={m.id}
                    onClick={() => setMentorSelecionado(m.id)}
                    style={{
                      padding: '13px 16px', borderRadius: 12,
                      border: `1.5px solid ${sel ? 'var(--primary)' : 'var(--border-strong)'}`,
                      background: sel ? 'var(--primary-light)' : 'white',
                      cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', gap: 12,
                      transition: 'border-color 0.15s, background 0.15s',
                      boxShadow: sel ? '0 2px 8px rgba(249,115,22,0.15)' : 'none',
                    }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      background: `linear-gradient(135deg, ${mc1}, ${mc2})`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 800, color: 'white',
                    }}>
                      {m.nome.split(' ').map((w: string) => w[0]).slice(0, 2).join('')}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: sel ? 'var(--primary)' : 'var(--text)' }}>
                        {m.nome}
                      </div>
                      {m.email && (
                        <div style={{ fontSize: 12, color: 'var(--text-hint)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.email}
                        </div>
                      )}
                    </div>
                    {sel && (
                      <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Botões de ação */}
            <div style={{ padding: '0 20px', display: 'flex', gap: 10 }}>
              <button
                onClick={() => setEncaminhandoId(null)}
                style={{
                  flex: 1, padding: 14, borderRadius: 12,
                  border: '1.5px solid var(--border-strong)', background: 'white',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'inherit', color: 'var(--text-muted)',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={encaminhar}
                disabled={!mentorSelecionado || salvando}
                style={{
                  flex: 2, padding: 14, borderRadius: 12, border: 'none',
                  background: mentorSelecionado && !salvando ? 'var(--primary)' : '#cbd5e1',
                  color: 'white', fontSize: 14, fontWeight: 700,
                  cursor: mentorSelecionado && !salvando ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit',
                  boxShadow: mentorSelecionado && !salvando ? '0 2px 8px rgba(249,115,22,0.35)' : 'none',
                  transition: 'background 0.15s, box-shadow 0.15s',
                }}
              >
                {salvando ? 'Encaminhando...' : '→ Encaminhar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
