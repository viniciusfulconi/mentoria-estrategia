'use client'
import { useEffect, useState } from 'react'
import { dbQuery, dbInsert } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'
import { CORES_MATERIA } from '@/lib/agenda'
import { BookOpen, ListChecks, Repeat, CalendarDays, Search } from 'lucide-react'

const TIPOS = [
  { val: 'revisao', label: 'Revisão',            icon: Repeat },
  { val: 'lista',   label: 'Lista de exercícios', icon: ListChecks },
  { val: 'teoria',  label: 'Teoria',             icon: BookOpen },
]

export default function NovaTarefa() {
  const { perfil, verticalAtiva } = useAuth()
  const router = useRouter()
  const isMentor = perfil?.papel === 'mentor'

  const [alunos, setAlunos] = useState<any[]>([])
  const [materias, setMaterias] = useState<string[]>([])
  const [busca, setBusca] = useState('')
  const [selecionados, setSelecionados] = useState<Record<string, boolean>>({})

  const [materia, setMateria] = useState('')
  const [tipo, setTipo] = useState('revisao')
  const [link, setLink] = useState('')
  const [comentario, setComentario] = useState('')

  const [modoPrazo, setModoPrazo] = useState<'dia' | 'janela'>('dia')
  const hoje = new Date().toISOString().split('T')[0]
  const [data, setData] = useState(hoje)
  const [horaInicio, setHoraInicio] = useState('08:00')
  const [horaFim, setHoraFim] = useState('09:00')
  const [janelaInicio, setJanelaInicio] = useState(hoje)
  const [janelaFim, setJanelaFim] = useState(hoje)

  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!perfil) return
    const paramsAlunos: Record<string, string> = isMentor
      ? { mentor: `eq.${perfil.mentor_nome || ''}`, order: 'nome' }
      : { order: 'nome' }
    Promise.all([
      dbQuery('alunos_dados', paramsAlunos, 'id_aluno,nome,mentor'),
      dbQuery('topicos', {}, 'materia'),
    ]).then(([{ data: a }, { data: m }]) => {
      setAlunos(a || [])
      setMaterias([...new Set((m || []).map((x: any) => x.materia))].sort() as string[])
    })
  }, [perfil])

  const alunosFiltrados = alunos.filter(a =>
    a.nome?.toLowerCase().includes(busca.toLowerCase())
  )
  const idsSelecionados = Object.keys(selecionados).filter(k => selecionados[k])
  const todosVisiveisSelecionados = alunosFiltrados.length > 0 &&
    alunosFiltrados.every(a => selecionados[a.id_aluno])

  function toggle(id: string) {
    setSelecionados(s => ({ ...s, [id]: !s[id] }))
  }
  function toggleTodos() {
    const novo = { ...selecionados }
    const marcar = !todosVisiveisSelecionados
    alunosFiltrados.forEach(a => { novo[a.id_aluno] = marcar })
    setSelecionados(novo)
  }

  async function salvar() {
    setErro('')
    if (idsSelecionados.length === 0) { setErro('Selecione ao menos um aluno.'); return }
    if (!materia) { setErro('Selecione a matéria.'); return }
    if (tipo === 'lista' && !link.trim()) { setErro('Cole o link da lista de exercícios.'); return }
    if (modoPrazo === 'dia' && !data) { setErro('Escolha a data da tarefa.'); return }
    if (modoPrazo === 'janela') {
      if (!janelaInicio || !janelaFim) { setErro('Preencha a janela de dias.'); return }
      if (janelaFim < janelaInicio) { setErro('A data final da janela não pode ser antes da inicial.'); return }
    }
    setSaving(true)

    const tarefa: Record<string, any> = {
      criado_por_id: perfil?.id,
      criado_por_papel: perfil?.papel,
      criado_por_nome: perfil?.nome,
      materia,
      tipo,
      link: tipo === 'lista' ? link.trim() : null,
      comentario: comentario.trim() || null,
      modo_prazo: modoPrazo,
      data: modoPrazo === 'dia' ? data : null,
      hora_inicio: modoPrazo === 'dia' ? horaInicio : null,
      hora_fim: modoPrazo === 'dia' ? horaFim : null,
      janela_inicio: modoPrazo === 'janela' ? janelaInicio : null,
      janela_fim: modoPrazo === 'janela' ? janelaFim : null,
      vertical: verticalAtiva || 'ITA',
    }

    const { data: criada, error } = await dbInsert('tarefas', tarefa, true)
    if (error || !criada?.[0]) { setErro(error || 'Falha ao criar tarefa.'); setSaving(false); return }
    const tarefaId = criada[0].id

    const vinculos = idsSelecionados.map(aluno_id => ({ tarefa_id: tarefaId, aluno_id }))
    const { error: e2 } = await dbInsert('tarefas_alunos', vinculos)
    if (e2) { setErro(e2); setSaving(false); return }

    // Notifica cada aluno
    const tipoLabel = TIPOS.find(t => t.val === tipo)?.label || 'Tarefa'
    const notifs = idsSelecionados.map(aluno_id => ({
      aluno_id,
      tipo: 'tarefa',
      titulo: `Nova tarefa: ${materia}`,
      mensagem: `${tipoLabel} — ${perfil?.nome} atribuiu uma tarefa para você.`,
    }))
    await dbInsert('notificacoes', notifs).catch(() => {})

    router.push('/tarefas')
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>←</button>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Nova tarefa</div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Alunos */}
        <div>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Aluno(s) — {idsSelecionados.length} selecionado(s)</span>
            {alunosFiltrados.length > 0 && (
              <button onClick={toggleTodos} style={{ background: 'none', border: 'none', color: '#f97316', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                {todosVisiveisSelecionados ? 'Limpar' : 'Selecionar todos'}
              </button>
            )}
          </label>
          <div style={{ position: 'relative', marginTop: 6, marginBottom: 8 }}>
            <Search size={14} color="#999" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar aluno..." style={{ paddingLeft: 32 }} />
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: 4 }}>
            {alunosFiltrados.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: '#999', fontSize: 13 }}>Nenhum aluno encontrado.</div>
            ) : alunosFiltrados.map(a => {
              const sel = !!selecionados[a.id_aluno]
              return (
                <div key={a.id_aluno} onClick={() => toggle(a.id_aluno)} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8,
                  cursor: 'pointer', background: sel ? '#fff7ed' : 'transparent',
                }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                    border: `1.5px solid ${sel ? '#f97316' : 'rgba(0,0,0,0.2)'}`,
                    background: sel ? '#f97316' : 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: 12, fontWeight: 700,
                  }}>{sel ? '✓' : ''}</div>
                  <span style={{ fontSize: 13, color: sel ? '#c2410c' : '#333', fontWeight: sel ? 600 : 400 }}>{a.nome}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Matéria */}
        <div>
          <label>Matéria</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {materias.map(m => {
              const cor = CORES_MATERIA[m] || '#f97316'
              return (
                <button key={m} onClick={() => setMateria(m)} style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 11,
                  border: `1.5px solid ${materia === m ? cor : 'rgba(0,0,0,0.12)'}`,
                  background: materia === m ? cor : 'transparent',
                  color: materia === m ? 'white' : '#666',
                  cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
                }}>{m}</button>
              )
            })}
          </div>
        </div>

        {/* Tipo */}
        <div>
          <label>Tipo de tarefa</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            {TIPOS.map(t => {
              const Icon = t.icon
              const ativo = tipo === t.val
              return (
                <button key={t.val} onClick={() => setTipo(t.val)} style={{
                  flex: 1, padding: '10px 8px', borderRadius: 10, cursor: 'pointer',
                  border: `1.5px solid ${ativo ? '#f97316' : 'rgba(0,0,0,0.12)'}`,
                  background: ativo ? '#fff7ed' : 'white', color: ativo ? '#c2410c' : '#666',
                  fontFamily: 'inherit', fontSize: 12, fontWeight: ativo ? 700 : 400,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                }}>
                  <Icon size={17} strokeWidth={2} />{t.label}
                </button>
              )
            })}
          </div>
        </div>

        {tipo === 'lista' && (
          <div>
            <label>Link da lista de exercícios</label>
            <input value={link} onChange={e => setLink(e.target.value)} placeholder="https://..." />
          </div>
        )}

        {/* Prazo */}
        <div>
          <label>Prazo</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            {([
              { val: 'dia', label: 'Dia e horário', icon: CalendarDays },
              { val: 'janela', label: 'Janela de dias', icon: Repeat },
            ] as const).map(op => {
              const Icon = op.icon
              const ativo = modoPrazo === op.val
              return (
                <button key={op.val} onClick={() => setModoPrazo(op.val)} style={{
                  flex: 1, padding: '10px 8px', borderRadius: 10, cursor: 'pointer',
                  border: `1.5px solid ${ativo ? '#f97316' : 'rgba(0,0,0,0.12)'}`,
                  background: ativo ? '#fff7ed' : 'white', color: ativo ? '#c2410c' : '#666',
                  fontFamily: 'inherit', fontSize: 12, fontWeight: ativo ? 700 : 400,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                  <Icon size={15} strokeWidth={2} />{op.label}
                </button>
              )
            })}
          </div>

          {modoPrazo === 'dia' ? (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div><label>Data</label><input type="date" value={data} onChange={e => setData(e.target.value)} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label>Início</label><input type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value)} /></div>
                <div><label>Fim</label><input type="time" value={horaFim} onChange={e => setHoraFim(e.target.value)} /></div>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label>De</label><input type="date" value={janelaInicio} onChange={e => setJanelaInicio(e.target.value)} /></div>
              <div><label>Até</label><input type="date" value={janelaFim} min={janelaInicio} onChange={e => setJanelaFim(e.target.value)} /></div>
            </div>
          )}
        </div>

        {/* Comentário */}
        <div>
          <label>Comentário / instruções (opcional)</label>
          <textarea value={comentario} onChange={e => setComentario(e.target.value)} placeholder="O que o aluno deve fazer..." rows={3} style={{ resize: 'vertical' }} />
        </div>

        {erro && <div style={{ color: '#DC2626', fontSize: 13 }}>{erro}</div>}
        <button className="btn-primary" onClick={salvar} disabled={saving}>
          {saving ? 'Enviando...' : `Enviar tarefa${idsSelecionados.length > 1 ? ` para ${idsSelecionados.length} alunos` : ''}`}
        </button>
        <button className="btn-secondary" onClick={() => router.back()}>Cancelar</button>
      </div>
      <Nav />
    </div>
  )
}
