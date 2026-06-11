'use client'
import { useEffect, useState } from 'react'
import { dbQuery, dbInsert } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'
import { CheckSquare, Square, Users } from 'lucide-react'

const TIPO_LABEL: Record<string, string> = { ime: 'IME', ita: 'ITA' }

type Aluno = { id_aluno: string; nome: string }

export default function NovaProvaAntigaHorario() {
  const { perfil, verticalAtiva } = useAuth()
  const router = useRouter()

  const isCoord = perfil?.papel === 'coordenador' || perfil?.papel === 'direcao'

  const [alunos, setAlunos] = useState<Aluno[]>([])
  const [provas, setProvas] = useState<any[]>([])
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [jaTemProva, setJaTemProva] = useState<Set<string>>(new Set())
  const [carregandoAlunos, setCarregandoAlunos] = useState(true)

  const [form, setForm] = useState({
    aluno_id: '',
    prova_id: '',
    data: new Date().toISOString().split('T')[0],
    hora_inicio: '08:00',
    hora_fim: '13:00',
  })
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState<{ inseridos: number; pulados: number } | null>(null)

  useEffect(() => {
    if (!perfil) return
    const alunoQuery = isCoord
      ? dbQuery('alunos_dados', { order: 'nome' }, 'id_aluno,nome')
      : dbQuery('alunos_dados', { mentor: `eq.${perfil.mentor_nome || ''}`, order: 'nome' }, 'id_aluno,nome')

    Promise.all([alunoQuery, dbQuery('provas_antigas', { order: 'nome' })]).then(
      ([{ data: a }, { data: p }]) => {
        const lista = (a || []) as Aluno[]
        setAlunos(lista)
        if (isCoord) setSelecionados(new Set(lista.map(x => x.id_aluno)))
        setProvas(p || [])
        setCarregandoAlunos(false)
      }
    )
  }, [perfil])

  // Quando a prova muda, verifica quem já tem
  useEffect(() => {
    if (!form.prova_id) { setJaTemProva(new Set()); return }
    dbQuery('provas_aluno', { prova_id: `eq.${form.prova_id}` }, 'aluno_id').then(({ data }) => {
      const set = new Set<string>((data || []).map((x: any) => x.aluno_id))
      setJaTemProva(set)
      // Remove da seleção quem já tem (coordenador)
      if (isCoord) {
        setSelecionados(prev => {
          const next = new Set(prev)
          set.forEach(id => next.delete(id))
          return next
        })
      }
    })
  }, [form.prova_id])

  const provaSelecionada = provas.find(p => p.id === form.prova_id)
  const elegíveis = alunos.filter(a => !jaTemProva.has(a.id_aluno))
  const todosSelecionados = elegíveis.length > 0 && elegíveis.every(a => selecionados.has(a.id_aluno))

  function toggleAluno(id: string) {
    if (jaTemProva.has(id)) return
    setSelecionados(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleTodos() {
    if (todosSelecionados) {
      setSelecionados(new Set())
    } else {
      setSelecionados(new Set(elegíveis.map(a => a.id_aluno)))
    }
  }

  async function salvar() {
    setErro('')
    if (!form.prova_id) { setErro('Selecione a prova.'); return }
    if (!form.data) { setErro('Informe a data.'); return }

    const dataFormatada = new Date(form.data + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })
    const vertical = verticalAtiva || 'ITA'
    const dtInicio = `${form.data}T${form.hora_inicio}:00`
    const dtFim = `${form.data}T${form.hora_fim}:00`

    function atividadeEntry(alunoId: string) {
      return {
        tipo: 'prova_antiga',
        titulo: provaSelecionada?.nome || 'Prova antiga',
        aluno_id: alunoId,
        data_inicio: dtInicio,
        data_fim: dtFim,
        link: provaSelecionada?.pdf_url || null,
        criado_por: isCoord ? 'coordenador' : 'mentor',
        criado_por_id: perfil?.id,
        vertical,
      }
    }

    if (isCoord) {
      if (selecionados.size === 0) { setErro('Selecione ao menos um aluno.'); return }
      setSaving(true)

      const ids = [...selecionados]
      const { error } = await dbInsert('provas_aluno', ids.map(id => ({
        prova_id: form.prova_id,
        aluno_id: id,
        mentor: '',
        data: form.data,
        hora_inicio: form.hora_inicio,
        hora_fim: form.hora_fim,
        criado_por_id: perfil?.id,
      })))
      if (error) { setErro(error); setSaving(false); return }

      // Cria entradas no calendário para cada aluno
      await dbInsert('atividades', ids.map(id => atividadeEntry(id)))

      await dbInsert('notificacoes', ids.map(id => ({
        aluno_id: id,
        tipo: 'prova_atribuida',
        titulo: 'Nova prova agendada',
        mensagem: `${provaSelecionada?.nome || 'Prova'} · ${dataFormatada} das ${form.hora_inicio} às ${form.hora_fim}`,
      })))

      setSaving(false)
      setSucesso({ inseridos: ids.length, pulados: jaTemProva.size })
    } else {
      // Fluxo mentor — aluno individual
      if (!form.aluno_id) { setErro('Selecione o aluno.'); return }

      // Verificação de duplicata
      const { data: existente } = await dbQuery('provas_aluno', {
        prova_id: `eq.${form.prova_id}`,
        aluno_id: `eq.${form.aluno_id}`,
      }, 'id')
      if (existente && existente.length > 0) {
        setErro('Este aluno já tem esta prova agendada.')
        return
      }

      setSaving(true)
      const { error } = await dbInsert('provas_aluno', [{
        prova_id: form.prova_id,
        aluno_id: form.aluno_id,
        mentor: perfil?.mentor_nome || '',
        data: form.data,
        hora_inicio: form.hora_inicio,
        hora_fim: form.hora_fim,
        criado_por_id: perfil?.id,
      }])
      if (error) { setErro(error); setSaving(false); return }

      // Cria entrada no calendário do aluno
      await dbInsert('atividades', [atividadeEntry(form.aluno_id)])

      await dbInsert('notificacoes', [{
        aluno_id: form.aluno_id,
        tipo: 'prova_atribuida',
        titulo: 'Nova prova agendada',
        mensagem: `${provaSelecionada?.nome || 'Prova'} · ${dataFormatada} das ${form.hora_inicio} às ${form.hora_fim}`,
      }])

      router.push('/horario')
    }
  }

  // Tela de sucesso (coordenador)
  if (sucesso) {
    return (
      <div style={{ paddingBottom: 80 }}>
        <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ fontSize: 17, fontWeight: 600 }}>Prova adicionada</div>
        </div>
        <div style={{ padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Feito!</div>
          <div style={{ fontSize: 14, color: '#666', lineHeight: 1.7, marginBottom: 32 }}>
            <strong style={{ color: '#1a1a1a' }}>{sucesso.inseridos}</strong> aluno(s) tiveram a prova adicionada ao horário.
            {sucesso.pulados > 0 && (
              <><br /><span style={{ color: '#f97316' }}>{sucesso.pulados} já tinham esta prova e foram ignorados.</span></>
            )}
          </div>
          <button onClick={() => router.push('/horario')} className="btn-primary" style={{ background: '#f97316' }}>
            Voltar ao Horário
          </button>
        </div>
        <Nav />
      </div>
    )
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{
        background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)',
        padding: '16px', position: 'sticky', top: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>←</button>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Adicionar prova antiga</div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Prova */}
        <div>
          <label>Prova antiga</label>
          <select value={form.prova_id} onChange={e => setForm({ ...form, prova_id: e.target.value })}>
            <option value="">Selecione a prova</option>
            {provas.map(p => (
              <option key={p.id} value={p.id}>
                {p.nome} ({TIPO_LABEL[p.tipo] || p.tipo} · {p.fase}ª Fase · {p.num_questoes}q)
              </option>
            ))}
          </select>
        </div>

        {provaSelecionada && (
          <div style={{ background: '#fff7ed', borderRadius: 10, padding: 12, fontSize: 13, color: '#f97316', border: '1px solid rgba(249,115,22,0.2)' }}>
            📄 {provaSelecionada.nome} · {provaSelecionada.num_questoes} questões · {provaSelecionada.modelo === 'multipla_escolha' ? 'Múltipla escolha' : 'Discursiva'}
          </div>
        )}

        {/* Data e hora */}
        <div>
          <label>Data</label>
          <input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label>Início</label>
            <input type="time" value={form.hora_inicio} onChange={e => setForm({ ...form, hora_inicio: e.target.value })} />
          </div>
          <div>
            <label>Fim</label>
            <input type="time" value={form.hora_fim} onChange={e => setForm({ ...form, hora_fim: e.target.value })} />
          </div>
        </div>

        {/* Mentor: select individual */}
        {!isCoord && (
          <div>
            <label>Aluno</label>
            <select value={form.aluno_id} onChange={e => setForm({ ...form, aluno_id: e.target.value })}>
              <option value="">Selecione o aluno</option>
              {alunos.map(a => (
                <option key={a.id_aluno} value={a.id_aluno} disabled={jaTemProva.has(a.id_aluno)}>
                  {a.nome}{jaTemProva.has(a.id_aluno) ? ' — já tem esta prova' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Coordenador: lista com checkboxes */}
        {isCoord && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Users size={14} strokeWidth={2} color="#475569" />
                Alunos{!carregandoAlunos && ` (${selecionados.size} selecionado${selecionados.size !== 1 ? 's' : ''})`}
              </label>
              {elegíveis.length > 0 && (
                <button onClick={toggleTodos} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 12, color: '#f97316', fontFamily: 'inherit', fontWeight: 600, padding: 0,
                }}>
                  {todosSelecionados ? 'Desmarcar todos' : 'Marcar todos'}
                </button>
              )}
            </div>

            {carregandoAlunos ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#999', fontSize: 13 }}>Carregando alunos...</div>
            ) : alunos.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#999', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 12 }}>
                Nenhum aluno encontrado
              </div>
            ) : (
              <div style={{ border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 12, overflow: 'hidden' }}>
                {alunos.map((a, i) => {
                  const temProva = jaTemProva.has(a.id_aluno)
                  const selecionado = selecionados.has(a.id_aluno)
                  return (
                    <div
                      key={a.id_aluno}
                      onClick={() => toggleAluno(a.id_aluno)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 14px',
                        borderBottom: i < alunos.length - 1 ? '0.5px solid rgba(0,0,0,0.06)' : 'none',
                        cursor: temProva ? 'not-allowed' : 'pointer',
                        background: selecionado ? '#fff7ed' : 'white',
                        opacity: temProva ? 0.4 : 1,
                        transition: 'background 0.1s',
                      }}
                    >
                      {selecionado && !temProva
                        ? <CheckSquare size={16} strokeWidth={2} color="#f97316" style={{ flexShrink: 0 }} />
                        : <Square size={16} strokeWidth={1.5} color={temProva ? '#bbb' : '#cbd5e1'} style={{ flexShrink: 0 }} />
                      }
                      <span style={{ fontSize: 14, flex: 1 }}>{a.nome}</span>
                      {temProva && (
                        <span style={{ fontSize: 10, color: '#94a3b8', background: '#f1f5f9', borderRadius: 6, padding: '2px 7px', flexShrink: 0 }}>
                          já tem
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {jaTemProva.size > 0 && form.prova_id && (
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
                {jaTemProva.size} aluno(s) já têm esta prova e estão bloqueados.
              </div>
            )}
          </div>
        )}

        {form.prova_id && form.data && (
          <div style={{ background: '#1e293b', color: 'white', borderRadius: 10, padding: '10px 14px', fontSize: 12, lineHeight: 1.6 }}>
            📅 {provaSelecionada?.nome} — {new Date(form.data + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' })}
            {' '}· {form.hora_inicio}–{form.hora_fim}
          </div>
        )}

        {erro && <div style={{ color: '#DC2626', fontSize: 13 }}>{erro}</div>}

        <button
          className="btn-primary"
          onClick={salvar}
          disabled={saving || (isCoord && selecionados.size === 0)}
          style={{ background: '#f97316' }}
        >
          {saving
            ? 'Salvando...'
            : isCoord
              ? `Adicionar para ${selecionados.size} aluno${selecionados.size !== 1 ? 's' : ''}`
              : 'Adicionar ao calendário'
          }
        </button>
        <button className="btn-secondary" onClick={() => router.back()}>Cancelar</button>
      </div>

      <Nav />
    </div>
  )
}
