'use client'
import { useEffect, useState, useCallback } from 'react'
import { dbQuery, dbUpdate } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import Nav from '@/components/Nav'
import Link from 'next/link'
import { CORES_MATERIA } from '@/lib/agenda'
import { ListChecks, BookOpen, Repeat, ExternalLink, Clock, CalendarDays, CheckCircle2, Plus, User } from 'lucide-react'

const TIPO_LABEL: Record<string, string> = { revisao: 'Revisão', lista: 'Lista de exercícios', teoria: 'Teoria' }
const TIPO_ICON: Record<string, any> = { revisao: Repeat, lista: ListChecks, teoria: BookOpen }

function formatDataBR(d?: string | null) {
  if (!d) return ''
  const [y, m, dd] = d.split('-')
  return `${dd}/${m}/${y}`
}

function descrPrazo(t: any): string {
  if (!t) return ''
  if (t.modo_prazo === 'dia') {
    const h = t.hora_inicio ? ` · ${t.hora_inicio.slice(0, 5)}–${(t.hora_fim || '').slice(0, 5)}` : ''
    return `${formatDataBR(t.data)}${h}`
  }
  return `${formatDataBR(t.janela_inicio)} → ${formatDataBR(t.janela_fim)}`
}

export default function Tarefas() {
  const { perfil, verticalAtiva } = useAuth()
  const isAluno = perfil?.papel === 'aluno'
  const isMentor = perfil?.papel === 'mentor'
  const isCoord = perfil?.papel === 'coordenador' || perfil?.papel === 'direcao'

  const [linhas, setLinhas] = useState<any[]>([])       // tarefas_alunos + tarefa embutida
  const [nomes, setNomes] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [aba, setAba] = useState<'pendente' | 'cumprida'>('pendente')
  const [filtroAluno, setFiltroAluno] = useState('')
  const [sel, setSel] = useState<any>(null)
  const [comentarioAluno, setComentarioAluno] = useState('')
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    if (!perfil) return
    setLoading(true)

    // Mapa id_aluno → nome (staff)
    let mapaNomes: Record<string, string> = {}
    let idsAlunos: string[] = []
    if (isMentor || isCoord) {
      const paramsAlunos: Record<string, string> = isMentor
        ? { mentor: `eq.${perfil.mentor_nome || ''}`, order: 'nome' }
        : { order: 'nome' }
      const { data: als } = await dbQuery('alunos_dados', paramsAlunos, 'id_aluno,nome')
      ;(als || []).forEach((a: any) => { mapaNomes[a.id_aluno] = a.nome })
      idsAlunos = (als || []).map((a: any) => a.id_aluno)
      setNomes(mapaNomes)
    }

    const params: Record<string, string> = { order: 'created_at.desc' }
    if (isAluno && perfil.aluno_id) {
      params.aluno_id = `eq.${perfil.aluno_id}`
    } else if (isMentor) {
      if (idsAlunos.length === 0) { setLinhas([]); setLoading(false); return }
      params.aluno_id = `in.(${idsAlunos.join(',')})`
    }
    const { data } = await dbQuery('tarefas_alunos', params, '*, tarefa:tarefas(*)')
    let rows = (data || []).filter((r: any) => r.tarefa) // ignora órfãs
    // Coordenador: escopo pela vertical ativa
    if (isCoord) rows = rows.filter((r: any) => (r.tarefa.vertical || 'ITA') === (verticalAtiva || 'ITA'))
    setLinhas(rows)
    setLoading(false)
  }, [perfil, verticalAtiva, isAluno, isMentor, isCoord])

  useEffect(() => { carregar() }, [carregar])

  async function marcarCumprida() {
    if (!sel) return
    setSalvando(true)
    const { error } = await dbUpdate('tarefas_alunos', { id: `eq.${sel.id}` }, {
      status: 'cumprida',
      comentario_aluno: comentarioAluno.trim() || null,
      concluida_em: new Date().toISOString(),
    })
    setSalvando(false)
    if (error) { alert(error); return }
    setSel(null); setComentarioAluno('')
    carregar()
  }

  async function reabrir() {
    if (!sel) return
    setSalvando(true)
    await dbUpdate('tarefas_alunos', { id: `eq.${sel.id}` }, { status: 'pendente', concluida_em: null })
    setSalvando(false)
    setSel(null)
    carregar()
  }

  const alunosDosFiltros = [...new Set(linhas.map(l => l.aluno_id))]
    .map(id => ({ id, nome: nomes[id] || 'Aluno' }))
    .sort((a, b) => a.nome.localeCompare(b.nome))

  const visiveis = linhas
    .filter(l => l.status === aba)
    .filter(l => !filtroAluno || l.aluno_id === filtroAluno)

  const nPend = linhas.filter(l => l.status === 'pendente' && (!filtroAluno || l.aluno_id === filtroAluno)).length
  const nCump = linhas.filter(l => l.status === 'cumprida' && (!filtroAluno || l.aluno_id === filtroAluno)).length

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '12px 16px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 17, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ListChecks size={19} strokeWidth={2} color="#7C3AED" /> Tarefas
          </div>
          {(isMentor || isCoord) && (
            <Link href="/tarefas/nova" style={{ textDecoration: 'none', background: '#7C3AED', color: 'white', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={15} strokeWidth={2.5} /> Nova tarefa
            </Link>
          )}
        </div>

        {/* Filtro por aluno (staff) */}
        {(isMentor || isCoord) && alunosDosFiltros.length > 0 && (
          <select value={filtroAluno} onChange={e => setFiltroAluno(e.target.value)} style={{ marginBottom: 10 }}>
            <option value="">Todos os alunos ({alunosDosFiltros.length})</option>
            {alunosDosFiltros.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
        )}

        {/* Abas */}
        <div style={{ display: 'flex', gap: 6 }}>
          {([
            { val: 'pendente', label: `Pendentes (${nPend})` },
            { val: 'cumprida', label: `Cumpridas (${nCump})` },
          ] as const).map(a => (
            <button key={a.val} onClick={() => setAba(a.val)} style={{
              padding: '6px 16px', borderRadius: 16, fontSize: 12, border: 'none',
              background: aba === a.val ? '#7C3AED' : '#F1F5F9', color: aba === a.val ? 'white' : '#666',
              cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontWeight: aba === a.val ? 600 : 400,
            }}>{a.label}</button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>Carregando...</div>
        ) : visiveis.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: 48 }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
              <ListChecks size={38} strokeWidth={1.5} color="#CBD5E1" />
            </div>
            <div>{aba === 'pendente' ? 'Nenhuma tarefa pendente.' : 'Nenhuma tarefa cumprida ainda.'}</div>
          </div>
        ) : visiveis.map(l => {
          const t = l.tarefa
          const cor = CORES_MATERIA[t.materia] || '#7C3AED'
          const Icon = TIPO_ICON[t.tipo] || ListChecks
          return (
            <div key={l.id} onClick={() => { setSel(l); setComentarioAluno(l.comentario_aluno || '') }} className="card" style={{ cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'flex-start', padding: 14 }}>
              <div style={{ width: 6, alignSelf: 'stretch', borderRadius: 4, background: cor, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{t.materia}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: cor, background: cor + '18', borderRadius: 12, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Icon size={11} strokeWidth={2.5} /> {TIPO_LABEL[t.tipo]}
                  </span>
                  {l.status === 'cumprida' && <CheckCircle2 size={15} color="#16A34A" strokeWidth={2.5} />}
                </div>
                {t.comentario && <div style={{ fontSize: 12, color: '#555', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{t.comentario}</div>}
                <div style={{ fontSize: 11, color: '#999', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {t.modo_prazo === 'dia' ? <Clock size={11} /> : <CalendarDays size={11} />}
                  {descrPrazo(t)}
                  {(isMentor || isCoord) && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>· <User size={10} /> {nomes[l.aluno_id] || 'Aluno'}</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal detalhe */}
      {sel && (() => {
        const t = sel.tarefa
        const cor = CORES_MATERIA[t.materia] || '#7C3AED'
        return (
          <div onClick={() => setSel(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 440, padding: '22px 20px 20px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '86vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{ width: 14, height: 14, borderRadius: 4, background: cor, flexShrink: 0 }} />
                <div style={{ fontSize: 17, fontWeight: 700, flex: 1 }}>{t.materia}</div>
                <span style={{ fontSize: 11, fontWeight: 600, color: cor, background: cor + '18', borderRadius: 12, padding: '3px 10px' }}>{TIPO_LABEL[t.tipo]}</span>
              </div>

              <div style={{ fontSize: 13, color: '#666', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                {t.modo_prazo === 'dia' ? <Clock size={14} /> : <CalendarDays size={14} />}
                {t.modo_prazo === 'dia' ? 'Fazer em' : 'Janela para fazer'}: {descrPrazo(t)}
              </div>
              {(isMentor || isCoord) && (
                <div style={{ fontSize: 13, color: '#666', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <User size={14} /> {nomes[sel.aluno_id] || 'Aluno'}
                </div>
              )}
              {t.criado_por_nome && (
                <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>Atribuída por {t.criado_por_nome}</div>
              )}
              {t.comentario && (
                <div style={{ fontSize: 13, color: '#444', marginTop: 4, padding: 12, background: '#F7F6F3', borderRadius: 10, lineHeight: 1.6 }}>{t.comentario}</div>
              )}
              {t.tipo === 'lista' && t.link && (
                <a href={t.link} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, color: '#7C3AED', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>
                  <ExternalLink size={14} strokeWidth={2} /> Abrir lista de exercícios
                </a>
              )}

              {/* Comentário do aluno */}
              {isAluno ? (
                sel.status === 'pendente' ? (
                  <div style={{ marginTop: 16 }}>
                    <label>Comentário (opcional)</label>
                    <textarea value={comentarioAluno} onChange={e => setComentarioAluno(e.target.value)} rows={3} placeholder="Como foi? Alguma dúvida?" style={{ resize: 'vertical' }} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button onClick={marcarCumprida} disabled={salvando} style={{ flex: 1, padding: 11, borderRadius: 10, border: 'none', background: '#16A34A', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <CheckCircle2 size={16} strokeWidth={2.5} /> {salvando ? 'Salvando...' : 'Marcar como cumprida'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#16A34A', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                      <CheckCircle2 size={16} strokeWidth={2.5} /> Cumprida
                    </div>
                    {sel.comentario_aluno && (
                      <div style={{ fontSize: 13, color: '#444', padding: 12, background: '#F0FDF4', borderRadius: 10, lineHeight: 1.6, border: '1px solid #DCFCE7' }}>
                        “{sel.comentario_aluno}”
                      </div>
                    )}
                    <button onClick={reabrir} disabled={salvando} style={{ marginTop: 12, width: '100%', padding: 10, borderRadius: 10, border: '1px solid rgba(0,0,0,0.12)', background: 'white', color: '#666', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {salvando ? '...' : 'Reabrir tarefa'}
                    </button>
                  </div>
                )
              ) : (
                <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: sel.status === 'cumprida' ? '#F0FDF4' : '#FFF7ED', border: `1px solid ${sel.status === 'cumprida' ? '#DCFCE7' : '#FED7AA'}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: sel.status === 'cumprida' ? '#16A34A' : '#c2410c', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {sel.status === 'cumprida' ? <><CheckCircle2 size={15} strokeWidth={2.5} /> Cumprida</> : <><Clock size={15} strokeWidth={2.5} /> Pendente</>}
                  </div>
                  {sel.status === 'cumprida' && sel.comentario_aluno && (
                    <div style={{ fontSize: 13, color: '#444', marginTop: 8, lineHeight: 1.6 }}>Comentário do aluno: “{sel.comentario_aluno}”</div>
                  )}
                </div>
              )}

              <button onClick={() => setSel(null)} style={{ marginTop: 12, width: '100%', padding: 10, borderRadius: 10, border: 'none', background: '#F1F5F9', color: '#666', fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>
                Fechar
              </button>
            </div>
          </div>
        )
      })()}

      <Nav />
    </div>
  )
}
