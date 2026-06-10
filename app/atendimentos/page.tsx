'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { dbQuery, getToken } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import Nav from '@/components/Nav'
import Link from 'next/link'
import type { AtendimentoMentoria } from '@/lib/supabase'
import { List, DollarSign, Brain, CheckCircle2, Pin, FileText, Link2, Play, Sparkles, X, Copy, Check, Pencil } from 'lucide-react'
import { dbUpdate } from '@/lib/supabase'

export default function Atendimentos() {
  const { perfil, verticalAtiva } = useAuth()
  const router = useRouter()
  const [dados, setDados] = useState<AtendimentoMentoria[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [filtroMentor, setFiltroMentor] = useState('todos')
  const [filtroMes, setFiltroMes] = useState('todos')
  const [aba, setAba] = useState<'lista' | 'financeiro' | 'psico'>('lista')
  const [limite, setLimite] = useState(50)

  // Edição
  const [editando, setEditando] = useState<AtendimentoMentoria | null>(null)
  const [editForm, setEditForm] = useState<any>({})
  const [editSaving, setEditSaving] = useState(false)
  const [editErro, setEditErro] = useState('')
  const [alunosEdit, setAlunosEdit] = useState<any[]>([])

  // Resumo IA
  const [showResumo, setShowResumo] = useState(false)
  const [alunos, setAlunos] = useState<{ id_aluno: string; nome: string; mentor: string }[]>([])
  const [alunoSelecionado, setAlunoSelecionado] = useState<{ id_aluno: string; nome: string } | null>(null)
  const [busca, setBusca] = useState('')
  const [resumoLoading, setResumoLoading] = useState(false)
  const [resumoTexto, setResumoTexto] = useState<string | null>(null)
  const [resumoErro, setResumoErro] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [tipoResumo, setTipoResumo] = useState<'geral' | 'ultimo' | 'ultimos_dois'>('geral')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (verticalAtiva === 'Medicina') { router.replace('/med/alunos'); return }
    carregar()
  }, [perfil, verticalAtiva])

  async function carregar() {
    setErro(null)
    const params: Record<string, string> = { order: 'data_atendimento.desc' }
    if (perfil?.papel === 'mentor') params['mentor'] = `eq.${perfil.mentor_nome || ''}`
    const { data, error } = await dbQuery('atendimentos_mentoria', params)
    if (error) { setErro('Falha ao carregar atendimentos.'); setLoading(false); return }
    setDados(data || [])
    setLoading(false)
  }

  const mentores = [...new Set(dados.map(d => d.mentor))].sort()
  // Gera meses únicos a partir da data do atendimento (formato: MM/YYYY)
  const mesesUnicos = [...new Set(dados.map(d => {
    if (!d.data_atendimento) return null
    const dt = new Date(d.data_atendimento)
    return `${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`
  }).filter(Boolean))].sort() as string[]
  const meses = mesesUnicos

  function mesLabel(m: string) {
    const [mm, yyyy] = m.split('/')
    const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
    return `${nomes[Number(mm) - 1]} ${yyyy}`
  }

  function mesDaData(data: string) {
    if (!data) return ''
    const dt = new Date(data)
    return `${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`
  }

  const filtrados = dados.filter(d => {
    if (filtroMentor !== 'todos' && d.mentor !== filtroMentor) return false
    if (filtroMes !== 'todos' && mesDaData(d.data_atendimento) !== filtroMes) return false
    return true
  })

  // Financeiro por mentor
  const financeiroMentor = mentores.map(m => {
    const ats = filtrados.filter(d => d.mentor === m)
    const totalMin = ats.reduce((a, d) => a + (d.duracao_minutos || 0), 0)
    const totalValor = ats.reduce((a, d) => a + Number(d.valor_pago || 0), 0)
    return { mentor: m, count: ats.length, totalMin, totalValor }
  }).sort((a, b) => b.totalValor - a.totalValor)

  const totalGeral = filtrados.reduce((a, d) => a + Number(d.valor_pago || 0), 0)
  const psico = filtrados.filter(d => d.encaminhamento_psico)

  function formatMin(min: number) {
    const h = Math.floor(min / 60)
    const m = min % 60
    return h > 0 ? `${h}h${m > 0 ? ` ${m}min` : ''}` : `${m}min`
  }

  function abrirEdicao(d: AtendimentoMentoria) {
    setEditando(d)
    setEditErro('')
    setEditForm({
      tipo: d.tipo || 'Individual',
      aluno: d.aluno || '',
      data_atendimento: d.data_atendimento || '',
      hora_inicio: (d as any).hora_inicio || '',
      hora_fim: (d as any).hora_fim || '',
      encaminhamento_psico: d.encaminhamento_psico || false,
      solicitacao_aluno: d.solicitacao_aluno || '',
      descricao: d.descricao || '',
      link_gravacao: d.link_gravacao || '',
      link_gemini: d.link_gemini || '',
    })
    if (!alunosEdit.length) {
      dbQuery('alunos_dados', { order: 'nome' }, 'nome,mentor').then(({ data }) => setAlunosEdit(data || []))
    }
  }

  function calcDuracaoEdit() {
    if (!editForm.hora_inicio || !editForm.hora_fim) return 0
    const [hi, mi] = editForm.hora_inicio.split(':').map(Number)
    const [hf, mf] = editForm.hora_fim.split(':').map(Number)
    return (hf * 60 + mf) - (hi * 60 + mi)
  }

  async function salvarEdicao() {
    if (!editando) return
    setEditSaving(true); setEditErro('')
    const durMin = calcDuracaoEdit()
    const valor = durMin > 0 ? Math.round((durMin / 60) * 200 * 100) / 100 : editando.valor_pago
    const mes = new Date(editForm.data_atendimento).toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' })
    const ano = new Date(editForm.data_atendimento).getFullYear()
    const { error } = await dbUpdate('atendimentos_mentoria', { id: `eq.${editando.id}` }, {
      ...editForm,
      duracao_minutos: durMin > 0 ? durMin : editando.duracao_minutos,
      valor_pago: valor,
      mes, ano,
    })
    if (error) { setEditErro(error); setEditSaving(false); return }
    setEditando(null)
    carregar()
  }

  async function abrirResumo() {
    setShowResumo(true)
    setResumoTexto(null)
    setResumoErro(null)
    setAlunoSelecionado(null)
    setBusca('')
    if (!alunos.length) {
      const { data } = await dbQuery('alunos_dados', { order: 'nome' }, 'id_aluno,nome,mentor')
      setAlunos(data || [])
    }
  }

  async function gerarResumo() {
    if (!alunoSelecionado) return
    abortRef.current = new AbortController()
    setResumoLoading(true)
    setResumoTexto(null)
    setResumoErro(null)
    try {
      const token = getToken()
      const resp = await fetch('/api/resumo-atendimentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alunoId: alunoSelecionado.id_aluno, alunoNome: alunoSelecionado.nome, token, tipo: tipoResumo }),
        signal: abortRef.current.signal,
      })
      const json = await resp.json()
      if (!resp.ok) setResumoErro(json.error || 'Erro desconhecido')
      else setResumoTexto(json.resumo)
    } catch (e: any) {
      if (e.name !== 'AbortError') setResumoErro(e.message)
    } finally {
      setResumoLoading(false)
      abortRef.current = null
    }
  }

  function cancelarResumo() {
    abortRef.current?.abort()
    setResumoLoading(false)
  }

  function copiarResumo() {
    if (!resumoTexto) return
    navigator.clipboard.writeText(resumoTexto)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 17, fontWeight: 600 }}>Atendimentos</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {perfil?.papel === 'coordenador' && (
              <>
                <button onClick={abrirResumo}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#F3F0FF', color: '#f97316', border: 'none', borderRadius: 10, padding: '6px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>
                  <Sparkles size={13} strokeWidth={2} />Resumo IA
                </button>
                <Link href="/atendimentos/upload" style={{ textDecoration: 'none', background: '#F1F5F9', color: '#666', borderRadius: 10, padding: '6px 12px', fontSize: 12 }}>↑ Import</Link>
              </>
            )}
            {perfil?.papel !== 'direcao' && (
              <Link href="/atendimentos/novo" style={{ textDecoration: 'none', background: '#f97316', color: 'white', borderRadius: 10, padding: '6px 12px', fontSize: 12, fontWeight: 500 }}>+ Novo</Link>
            )}
          </div>
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 8 }}>
          {(perfil?.papel === 'coordenador' || perfil?.papel === 'direcao') && (
            <select value={filtroMentor} onChange={e => setFiltroMentor(e.target.value)}
              style={{ fontSize: 11, padding: '4px 8px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.12)', background: '#F7F6F3', fontFamily: 'DM Sans,sans-serif' }}>
              <option value="todos">Todos os mentores</option>
              {mentores.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
          <select value={filtroMes} onChange={e => setFiltroMes(e.target.value)}
            style={{ fontSize: 11, padding: '4px 8px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.12)', background: '#F7F6F3', fontFamily: 'DM Sans,sans-serif' }}>
            <option value="todos">Todos os meses</option>
            {meses.map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
          </select>
        </div>

        {/* Abas */}
        <div style={{ display: 'flex', gap: 4 }}>
          {([
            { id: 'lista', label: `Lista (${filtrados.length})`, Icon: List },
            { id: 'financeiro', label: 'Financeiro', Icon: DollarSign },
            { id: 'psico', label: `Psico (${psico.length})`, Icon: Brain },
          ] as const).map(a => (
            <button key={a.id} onClick={() => setAba(a.id as any)} style={{
              padding: '4px 12px', borderRadius: 14, fontSize: 11, border: 'none',
              background: aba === a.id ? '#1a1a1a' : '#F1F5F9',
              color: aba === a.id ? 'white' : '#666',
              cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}>
              <a.Icon size={11} strokeWidth={2} />
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {loading ? (
          <>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="card" style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div className="skeleton" style={{ height: 13, width: '55%' }} />
                    <div className="skeleton" style={{ height: 11, width: '40%' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                    <div className="skeleton" style={{ height: 13, width: 60 }} />
                    <div className="skeleton" style={{ height: 10, width: 40 }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <div className="skeleton" style={{ height: 20, width: 64, borderRadius: 8 }} />
                </div>
              </div>
            ))}
          </>
        ) : erro ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 13, color: '#DC2626', marginBottom: 12 }}>{erro}</div>
            <button onClick={carregar} style={{ padding: '8px 20px', borderRadius: 10, background: '#f97316', color: 'white', border: 'none', fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Tentar novamente</button>
          </div>
        ) : (
          <>
            {/* LISTA */}
            {aba === 'lista' && filtrados.slice(0, limite).map(d => (
              <div key={d.id} className="card" style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>{d.aluno || 'Atendimento coletivo'}</div>
                    <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{d.mentor} · {new Date(d.data_atendimento).toLocaleDateString('pt-BR')}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexShrink: 0 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#16A34A' }}>R$ {Number(d.valor_pago || 0).toFixed(2)}</div>
                      <div style={{ fontSize: 10, color: '#999' }}>{formatMin(d.duracao_minutos || 0)}</div>
                    </div>
                    {(perfil?.papel === 'coordenador' || d.mentor === perfil?.mentor_nome) && (
                      <button onClick={() => abrirEdicao(d)} style={{
                        background: '#F1F5F9', border: 'none', borderRadius: 8,
                        padding: '5px 7px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                        color: '#64748B', marginTop: 1,
                      }}>
                        <Pencil size={13} strokeWidth={2} />
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: d.tipo === 'Individual' ? '#fff7ed' : '#DCFCE7', color: d.tipo === 'Individual' ? '#1E40AF' : '#14532D' }}>{d.tipo}</span>
                  {d.encaminhamento_psico && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: '#FEF2F2', color: '#991B1B', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Brain size={10} strokeWidth={2} />Psico</span>}
                  {d.arquivo_gemini_url && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: '#DCFCE7', color: '#14532D', display: 'inline-flex', alignItems: 'center', gap: 4 }}><FileText size={10} strokeWidth={2} />Docx</span>}
                  {d.link_gemini && !d.arquivo_gemini_url && <a href={d.link_gemini} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: '#F1F5F9', color: '#f97316', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Link2 size={10} strokeWidth={2} />Gemini</a>}
                  {d.link_gravacao && <a href={d.link_gravacao} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: '#F1F5F9', color: '#f97316', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Play size={10} strokeWidth={2} />Gravação</a>}
                </div>
                {d.descricao && <div style={{ fontSize: 12, color: '#666', marginTop: 8, lineHeight: 1.5, borderTop: '0.5px solid rgba(0,0,0,0.06)', paddingTop: 8 }}>{d.descricao}</div>}
              </div>
            ))}

            {aba === 'lista' && filtrados.length > limite && (
              <button
                onClick={() => setLimite(l => l + 50)}
                style={{ width: '100%', padding: '12px', borderRadius: 12, border: '0.5px solid rgba(0,0,0,0.12)', background: 'white', color: '#f97316', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', marginBottom: 10 }}
              >
                Carregar mais ({filtrados.length - limite} restantes)
              </button>
            )}

            {/* FINANCEIRO */}
            {aba === 'financeiro' && (
              <>
                <div style={{ background: '#f97316', borderRadius: 14, padding: '16px 20px', marginBottom: 16, textAlign: 'center' }}>
                  <div style={{ fontSize: 32, fontWeight: 800, color: 'white' }}>R$ {totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>Total gasto · {filtrados.length} atendimentos</div>
                </div>
                {financeiroMentor.map(f => (
                  <div key={f.mentor} className="card" style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{f.mentor}</div>
                        <div style={{ fontSize: 11, color: '#999' }}>{f.count} atend. · {formatMin(f.totalMin)}</div>
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#16A34A' }}>R$ {f.totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                    </div>
                    <div style={{ height: 6, background: '#F1F5F9', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${totalGeral > 0 ? (f.totalValor/totalGeral)*100 : 0}%`, background: '#f97316', borderRadius: 3 }} />
                    </div>
                    <div style={{ fontSize: 10, color: '#999', marginTop: 4 }}>{totalGeral > 0 ? ((f.totalValor/totalGeral)*100).toFixed(1) : 0}% do total</div>
                  </div>
                ))}
              </>
            )}

            {/* PSICOLÓGICO */}
            {aba === 'psico' && (
              psico.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><CheckCircle2 size={36} strokeWidth={1.5} color="#86EFAC" /></div>
                  <div>Nenhum encaminhamento psicológico neste período</div>
                </div>
              ) : psico.map(d => (
                <div key={d.id} className="card" style={{ marginBottom: 10, borderLeft: '3px solid #DC2626' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{d.aluno}</div>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>
                    {d.mentor} · {new Date(d.data_atendimento).toLocaleDateString('pt-BR')}
                  </div>
                  {d.solicitacao_aluno && <div style={{ fontSize: 12, color: '#DC2626', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}><Pin size={11} strokeWidth={2} />{d.solicitacao_aluno}</div>}
                  {d.descricao && <div style={{ fontSize: 12, color: '#666', lineHeight: 1.5 }}>{d.descricao}</div>}
                </div>
              ))
            )}
          </>
        )}
      </div>
      <Nav />

      {/* Drawer de edição */}
      {editando && (
        <div onClick={() => setEditando(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 20px 14px', borderBottom: '0.5px solid rgba(0,0,0,0.08)', flexShrink: 0 }}>
              <Pencil size={16} strokeWidth={2} color="#f97316" />
              <div style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>Editar atendimento</div>
              <button onClick={() => setEditando(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', display: 'flex' }}>
                <X size={20} strokeWidth={2} />
              </button>
            </div>

            <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Tipo */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>Tipo</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['Individual', 'Coletiva'].map(t => (
                    <button key={t} onClick={() => setEditForm((f: any) => ({ ...f, tipo: t, aluno: t === 'Coletiva' ? '' : f.aluno }))} style={{
                      flex: 1, padding: '8px', borderRadius: 10,
                      border: `1.5px solid ${editForm.tipo === t ? '#f97316' : 'rgba(0,0,0,0.1)'}`,
                      background: editForm.tipo === t ? '#fff7ed' : 'transparent',
                      color: editForm.tipo === t ? '#f97316' : '#666',
                      cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 500,
                    }}>{t}</button>
                  ))}
                </div>
              </div>

              {/* Aluno */}
              {editForm.tipo === 'Individual' && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>Aluno</label>
                  <select value={editForm.aluno} onChange={e => setEditForm((f: any) => ({ ...f, aluno: e.target.value }))} style={{ margin: 0, fontSize: 13 }}>
                    <option value="">Selecione o aluno</option>
                    {(editForm.mentor
                      ? alunosEdit.filter((a: any) => a.mentor === (editando.mentor))
                      : alunosEdit
                    ).map((a: any) => <option key={a.nome} value={a.nome}>{a.nome}</option>)}
                  </select>
                </div>
              )}

              {/* Data */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>Data do atendimento</label>
                <input type="date" value={editForm.data_atendimento} onChange={e => setEditForm((f: any) => ({ ...f, data_atendimento: e.target.value }))} style={{ margin: 0, fontSize: 13 }} />
              </div>

              {/* Horários */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>Início</label>
                  <input type="time" value={editForm.hora_inicio} onChange={e => setEditForm((f: any) => ({ ...f, hora_inicio: e.target.value }))} style={{ margin: 0, fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>Fim</label>
                  <input type="time" value={editForm.hora_fim} onChange={e => setEditForm((f: any) => ({ ...f, hora_fim: e.target.value }))} style={{ margin: 0, fontSize: 13 }} />
                </div>
              </div>

              {/* Psico */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: editForm.encaminhamento_psico ? '#FEF2F2' : '#F7F6F3', borderRadius: 12, padding: '10px 14px', cursor: 'pointer' }}
                onClick={() => setEditForm((f: any) => ({ ...f, encaminhamento_psico: !f.encaminhamento_psico }))}>
                <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${editForm.encaminhamento_psico ? '#DC2626' : 'rgba(0,0,0,0.15)'}`, background: editForm.encaminhamento_psico ? '#DC2626' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {editForm.encaminhamento_psico && <span style={{ color: 'white', fontSize: 12 }}>✓</span>}
                </div>
                <span style={{ fontSize: 13, fontWeight: 500, color: editForm.encaminhamento_psico ? '#DC2626' : '#1a1a1a' }}>Encaminhamento psicológico</span>
              </div>

              {/* Solicitação */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>Solicitação do aluno</label>
                <input value={editForm.solicitacao_aluno} onChange={e => setEditForm((f: any) => ({ ...f, solicitacao_aluno: e.target.value }))} placeholder="O que o aluno solicitou?" style={{ margin: 0, fontSize: 13 }} />
              </div>

              {/* Descrição */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>Descrição</label>
                <textarea value={editForm.descricao} onChange={e => setEditForm((f: any) => ({ ...f, descricao: e.target.value }))} rows={4} style={{ resize: 'vertical', margin: 0, fontSize: 13, width: '100%', padding: '8px 12px', borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.12)', fontFamily: 'DM Sans,sans-serif' }} />
              </div>

              {/* Links */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>Link da gravação</label>
                <input value={editForm.link_gravacao} onChange={e => setEditForm((f: any) => ({ ...f, link_gravacao: e.target.value }))} placeholder="https://drive.google.com/..." style={{ margin: 0, fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>Link do relatório Gemini</label>
                <input value={editForm.link_gemini} onChange={e => setEditForm((f: any) => ({ ...f, link_gemini: e.target.value }))} placeholder="https://docs.google.com/..." style={{ margin: 0, fontSize: 13 }} />
              </div>

              {editErro && <div style={{ color: '#DC2626', fontSize: 12, background: '#FEF2F2', padding: '8px 12px', borderRadius: 8 }}>{editErro}</div>}

              <button onClick={salvarEdicao} disabled={editSaving} style={{
                padding: '12px', borderRadius: 12, border: 'none',
                background: '#f97316', color: 'white', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', marginTop: 4,
              }}>
                {editSaving ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Resumo IA */}
      {showResumo && (
        <div onClick={() => setShowResumo(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            {/* Header do modal */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 20px 14px', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
              <Sparkles size={18} strokeWidth={2} color="#f97316" />
              <div style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>Resumo dos atendimentos</div>
              <button onClick={() => setShowResumo(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', display: 'flex', alignItems: 'center' }}>
                <X size={20} strokeWidth={2} />
              </button>
            </div>

            <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
              {!resumoTexto && !resumoErro && (
                <>
                  {/* Seletor de tipo */}
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#555' }}>Tipo de análise</div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                    {([
                      { id: 'geral', label: 'Geral' },
                      { id: 'ultimo', label: 'Último atendimento' },
                      { id: 'ultimos_dois', label: 'Últimos dois' },
                    ] as const).map(t => (
                      <button key={t.id} onClick={() => setTipoResumo(t.id)} style={{
                        flex: 1, padding: '7px 4px', borderRadius: 10, fontSize: 11, fontWeight: tipoResumo === t.id ? 600 : 400,
                        border: `1.5px solid ${tipoResumo === t.id ? '#f97316' : 'rgba(0,0,0,0.1)'}`,
                        background: tipoResumo === t.id ? '#F3F0FF' : 'white',
                        color: tipoResumo === t.id ? '#f97316' : '#666',
                        cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
                      }}>{t.label}</button>
                    ))}
                  </div>

                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#555' }}>Selecione o aluno</div>

                  {/* Busca */}
                  <input
                    value={busca}
                    onChange={e => setBusca(e.target.value)}
                    placeholder="Buscar aluno..."
                    style={{ marginBottom: 10 }}
                  />

                  {/* Lista de alunos */}
                  <div style={{ maxHeight: 260, overflowY: 'auto', borderRadius: 12, border: '0.5px solid rgba(0,0,0,0.1)', marginBottom: 16 }}>
                    {alunos.length === 0 ? (
                      <div style={{ padding: 20, textAlign: 'center', color: '#999', fontSize: 13 }}>Carregando...</div>
                    ) : alunos
                        .filter(a => a.nome.toLowerCase().includes(busca.toLowerCase()))
                        .map((a, i, arr) => (
                          <div key={a.id_aluno} onClick={() => setAlunoSelecionado(a)}
                            style={{
                              padding: '10px 14px', cursor: 'pointer',
                              borderBottom: i < arr.length - 1 ? '0.5px solid rgba(0,0,0,0.06)' : 'none',
                              background: alunoSelecionado?.id_aluno === a.id_aluno ? '#F3F0FF' : 'white',
                            }}>
                            <div style={{ fontSize: 13, fontWeight: alunoSelecionado?.id_aluno === a.id_aluno ? 600 : 400, color: alunoSelecionado?.id_aluno === a.id_aluno ? '#f97316' : '#1a1a1a' }}>{a.nome}</div>
                            <div style={{ fontSize: 11, color: '#999', marginTop: 1 }}>{a.mentor}</div>
                          </div>
                        ))
                    }
                  </div>

                  <button onClick={gerarResumo} disabled={resumoLoading || !alunoSelecionado}
                    style={{ width: '100%', padding: '12px', borderRadius: 12, border: 'none', background: alunoSelecionado ? '#f97316' : '#E2E8F0', color: alunoSelecionado ? 'white' : '#999', fontSize: 14, fontWeight: 600, cursor: alunoSelecionado ? 'pointer' : 'default', fontFamily: 'DM Sans,sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Sparkles size={16} strokeWidth={2} />
                    {resumoLoading ? 'Gerando resumo...' : alunoSelecionado ? `Analisar ${alunoSelecionado.nome.split(' ')[0]}` : 'Selecione um aluno'}
                  </button>
                  {resumoLoading && (
                    <div style={{ textAlign: 'center', marginTop: 10 }}>
                      <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>
                        Extraindo relatórios e consultando IA. Pode levar até 60s.
                      </div>
                      <button onClick={cancelarResumo} style={{ fontSize: 12, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', textDecoration: 'underline' }}>
                        Cancelar
                      </button>
                    </div>
                  )}
                </>
              )}

              {resumoErro && (
                <div>
                  <div style={{ background: '#FEF2F2', borderRadius: 12, padding: 16, marginBottom: 14 }}>
                    <div style={{ fontSize: 13, color: '#DC2626', fontWeight: 500, marginBottom: 4 }}>Erro ao gerar resumo</div>
                    <div style={{ fontSize: 12, color: '#991B1B' }}>{resumoErro}</div>
                  </div>
                  <button onClick={() => { setResumoErro(null) }}
                    style={{ width: '100%', padding: 10, borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.12)', background: 'transparent', color: '#666', fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>
                    Tentar novamente
                  </button>
                </div>
              )}

              {resumoTexto && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                    <button onClick={copiarResumo}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: copiado ? '#DCFCE7' : '#F1F5F9', color: copiado ? '#14532D' : '#555', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>
                      {copiado ? <><Check size={13} strokeWidth={2.5} />Copiado!</> : <><Copy size={13} strokeWidth={2} />Copiar</>}
                    </button>
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.75, color: '#1a1a1a', whiteSpace: 'pre-wrap', background: '#F8FAFC', borderRadius: 12, padding: 16 }}>
                    {resumoTexto}
                  </div>
                  <button onClick={() => { setResumoTexto(null); setResumoErro(null); setAlunoSelecionado(null); setBusca('') }}
                    style={{ width: '100%', marginTop: 14, padding: 10, borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.12)', background: 'transparent', color: '#666', fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>
                    Gerar outro resumo
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
