'use client'
import { useEffect, useState } from 'react'
import { dbQuery, dbInsert, dbUpdate } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'

const TIPO_LABEL: Record<string, string> = { ime: 'IME', ita: 'ITA' }

export default function NovaProvaAntigaHorario() {
  const { perfil } = useAuth()
  const router = useRouter()

  const [alunos, setAlunos] = useState<any[]>([])
  const [provas, setProvas] = useState<any[]>([])
  const [form, setForm] = useState({
    aluno_id: '',
    prova_id: '',
    data: new Date().toISOString().split('T')[0],
    hora_inicio: '08:00',
    hora_fim: '13:00',
  })
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!perfil) return
    Promise.all([
      dbQuery('alunos_dados', { mentor: `eq.${perfil.mentor_nome || ''}`, order: 'nome' }, 'id_aluno,nome'),
      dbQuery('provas_antigas', { order: 'nome' }),
    ]).then(([{ data: a }, { data: p }]) => {
      setAlunos(a || [])
      setProvas(p || [])
    })
  }, [perfil])

  const provaSelecionada = provas.find(p => p.id === form.prova_id)

  async function salvar() {
    if (!form.aluno_id) { setErro('Selecione o aluno.'); return }
    if (!form.prova_id) { setErro('Selecione a prova.'); return }
    if (!form.data) { setErro('Informe a data.'); return }
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
    if (error) { setErro(error); setSaving(false) }
    else {
      const dataFormatada = new Date(form.data + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })
      await dbInsert('notificacoes', [{
        aluno_id: form.aluno_id,
        tipo: 'prova_atribuida',
        titulo: `Nova prova agendada`,
        mensagem: `${provaSelecionada?.nome || 'Prova'} · ${dataFormatada} das ${form.hora_inicio} às ${form.hora_fim}`,
      }])
      router.push('/horario')
    }
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>←</button>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Adicionar prova antiga</div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label>Aluno</label>
          <select value={form.aluno_id} onChange={e => setForm({ ...form, aluno_id: e.target.value })}>
            <option value="">Selecione o aluno</option>
            {alunos.map(a => <option key={a.id_aluno} value={a.id_aluno}>{a.nome}</option>)}
          </select>
        </div>

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
          <div style={{ background: '#F3F0FF', borderRadius: 10, padding: 12, fontSize: 13, color: '#5B21B6' }}>
            📄 {provaSelecionada.nome} · {provaSelecionada.num_questoes} questões · {provaSelecionada.modelo === 'multipla_escolha' ? 'Múltipla escolha' : 'Discursiva'}
          </div>
        )}

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

        {form.prova_id && form.data && (
          <div style={{ background: '#212121', color: 'white', borderRadius: 10, padding: 12, fontSize: 12 }}>
            📄 {provaSelecionada?.nome} — {new Date(form.data + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
          </div>
        )}

        {erro && <div style={{ color: '#DC2626', fontSize: 13 }}>{erro}</div>}
        <button className="btn-primary" onClick={salvar} disabled={saving} style={{ background: '#7C3AED' }}>
          {saving ? 'Salvando...' : 'Adicionar ao calendário'}
        </button>
        <button className="btn-secondary" onClick={() => router.back()}>Cancelar</button>
      </div>

      <Nav />
    </div>
  )
}
