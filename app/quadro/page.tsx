'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Nav from '@/components/Nav'
import { dbQuery, dbInsert, dbDelete } from '@/lib/supabase'
import { Plus, Trash2, PenLine, Clock, X } from 'lucide-react'
import { CORES_MATERIA } from '@/lib/cores'

type Quadro = { id: string; titulo: string; materia: string; updated_at: string }

const MATERIAS = ['Geral', ...Object.keys(CORES_MATERIA)]

function corMateria(m: string) { return CORES_MATERIA[m] || '#64748b' }

function formatData(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'agora'
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

export default function QuadroListPage() {
  const { perfil, loading: authLoading } = useAuth()
  const router = useRouter()
  const [quadros, setQuadros] = useState<Quadro[]>([])
  const [loading, setLoading] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [novoTitulo, setNovoTitulo] = useState('')
  const [novaMateria, setNovaMateria] = useState('Geral')
  const [criando, setCriando] = useState(false)

  const alunoId = perfil?.aluno_id

  useEffect(() => {
    if (authLoading) return
    if (!alunoId) { setLoading(false); return }
    load()
  }, [authLoading, alunoId])

  async function load() {
    setLoading(true)
    const { data } = await dbQuery<Quadro>(
      'quadros_aluno',
      { aluno_id: `eq.${alunoId}`, order: 'updated_at.desc' },
      'id,titulo,materia,updated_at'
    )
    setQuadros(data || [])
    setLoading(false)
  }

  async function criarQuadro() {
    if (!alunoId) return
    setCriando(true)
    const titulo = novoTitulo.trim() || 'Sem título'
    const { data, error } = await dbInsert<Quadro>(
      'quadros_aluno',
      { aluno_id: alunoId, titulo, materia: novaMateria },
      true
    )
    setCriando(false)
    if (!error && data?.[0]) {
      setModalAberto(false)
      setNovoTitulo('')
      setNovaMateria('Geral')
      router.push(`/quadro/${data[0].id}`)
    }
  }

  async function excluir(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Excluir este quadro? Esta ação não pode ser desfeita.')) return
    await dbDelete('quadros_aluno', { id: `eq.${id}` })
    setQuadros(prev => prev.filter(q => q.id !== id))
  }

  // Agrupa por matéria na ordem de MATERIAS
  const grupos = MATERIAS
    .map(m => ({ materia: m, items: quadros.filter(q => (q.materia || 'Geral') === m) }))
    .filter(g => g.items.length > 0)

  if (authLoading) return null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 80 }}>
      <Nav />

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Quadro Branco</div>
            <div style={{ fontSize: 12, color: 'var(--text-hint)', marginTop: 2 }}>
              {quadros.length} quadro{quadros.length !== 1 ? 's' : ''} salvo{quadros.length !== 1 ? 's' : ''}
            </div>
          </div>
          {alunoId && (
            <button
              onClick={() => setModalAberto(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '10px 16px', borderRadius: 10,
                background: 'var(--primary)', color: 'white',
                border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                fontFamily: 'inherit',
              }}
            >
              <Plus size={15} strokeWidth={2.5} /> Novo quadro
            </button>
          )}
        </div>

        {/* Conteúdo */}
        {!alunoId && !loading ? (
          <div style={{ textAlign: 'center', padding: '48px 24px', background: 'white', borderRadius: 16, border: '1.5px dashed var(--border-strong)' }}>
            <PenLine size={32} color="var(--text-hint)" strokeWidth={1.5} style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Quadro branco é exclusivo para alunos</div>
            <div style={{ fontSize: 12, color: 'var(--text-hint)' }}>Cada aluno tem o próprio espaço para anotações e desenhos.</div>
          </div>
        ) : loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-hint)', fontSize: 13 }}>Carregando...</div>
        ) : quadros.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px', background: 'white', borderRadius: 16, border: '1.5px dashed var(--border-strong)' }}>
            <PenLine size={32} color="var(--text-hint)" strokeWidth={1.5} style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Nenhum quadro ainda</div>
            <div style={{ fontSize: 12, color: 'var(--text-hint)', marginBottom: 20 }}>Crie seu primeiro quadro para começar a anotar</div>
            <button onClick={() => setModalAberto(true)} style={{ padding: '10px 24px', borderRadius: 10, background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
              Criar quadro
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {grupos.map(({ materia, items }) => {
              const cor = corMateria(materia)
              return (
                <div key={materia}>
                  {/* Cabeçalho da matéria */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: cor, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: cor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {materia}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>
                      · {items.length} quadro{items.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Cards */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map(q => (
                      <div
                        key={q.id}
                        onClick={() => router.push(`/quadro/${q.id}`)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 14,
                          background: 'white', borderRadius: 14,
                          border: `0.5px solid var(--border)`,
                          borderLeft: `3px solid ${cor}`,
                          padding: '12px 14px', cursor: 'pointer',
                          transition: 'box-shadow 0.15s',
                          boxShadow: 'var(--shadow-xs)',
                        }}
                        onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-sm)'}
                        onMouseLeave={e => e.currentTarget.style.boxShadow = 'var(--shadow-xs)'}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {q.titulo}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                            <Clock size={10} color="var(--text-hint)" strokeWidth={2} />
                            <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>{formatData(q.updated_at)}</span>
                          </div>
                        </div>
                        <button
                          onClick={e => excluir(q.id, e)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-hint)', padding: 6, borderRadius: 8, display: 'flex', alignItems: 'center', transition: 'color 0.12s, background 0.12s' }}
                          onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.background = 'var(--red-light)' }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-hint)'; e.currentTarget.style.background = 'none' }}
                        >
                          <Trash2 size={14} strokeWidth={2} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal novo quadro */}
      {modalAberto && (
        <div
          onClick={() => setModalAberto(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(9,30,66,0.4)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'white', borderRadius: '20px 20px 0 0', padding: '24px 20px 32px', width: '100%', maxWidth: 480 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Novo quadro</div>
              <button onClick={() => setModalAberto(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-hint)', display: 'flex' }}>
                <X size={18} strokeWidth={2} />
              </button>
            </div>

            {/* Título */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Título</label>
              <input
                autoFocus
                value={novoTitulo}
                onChange={e => setNovoTitulo(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && criarQuadro()}
                placeholder="Ex: Derivadas — Ciclo 5"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-strong)', fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
              />
            </div>

            {/* Matéria */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>Matéria</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {MATERIAS.map(m => {
                  const sel = novaMateria === m
                  const cor = corMateria(m)
                  return (
                    <button
                      key={m}
                      onClick={() => setNovaMateria(m)}
                      style={{
                        padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                        border: `1.5px solid ${sel ? cor : 'var(--border-strong)'}`,
                        background: sel ? cor + '18' : 'white',
                        color: sel ? cor : 'var(--text-muted)',
                        cursor: 'pointer', fontFamily: 'inherit',
                        transition: 'all 0.12s',
                      }}
                    >
                      {m}
                    </button>
                  )
                })}
              </div>
            </div>

            <button
              onClick={criarQuadro}
              disabled={criando}
              style={{ width: '100%', padding: '13px 0', borderRadius: 12, background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', opacity: criando ? 0.7 : 1 }}
            >
              {criando ? 'Criando...' : 'Criar quadro'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
