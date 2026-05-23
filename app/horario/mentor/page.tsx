'use client'
import { useEffect, useState } from 'react'
import { dbQuery, dbInsert } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'
import { CORES_MATERIA } from '@/lib/agenda'

export default function MentorEstudo() {
  const { perfil } = useAuth()
  const router = useRouter()
  const [alunos, setAlunos] = useState<any[]>([])
  const [materias, setMaterias] = useState<string[]>([])
  const [form, setForm] = useState({ aluno_id: '', materia: '', professor: '', descricao: '', data: new Date().toISOString().split('T')[0], hora_inicio: '08:00', hora_fim: '09:00' })
  const [repeticao, setRepeticao] = useState('nenhuma')
  const [dataFimRep, setDataFimRep] = useState('')
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    Promise.all([
      dbQuery('alunos_dados', { mentor: `eq.${perfil?.mentor_nome || ''}`, order: 'nome' }),
      dbQuery('topicos', {}, 'materia'),
    ]).then(([{ data: a }, { data: m }]) => {
      setAlunos(a || [])
      setMaterias([...new Set((m || []).map((x: any) => x.materia))].sort() as string[])
    })
  }, [perfil])

  async function salvar() {
    if (!form.aluno_id || !form.materia || !form.data) { setErro('Preencha aluno, matéria e data.'); return }
    if (repeticao !== 'nenhuma' && !dataFimRep) { setErro('Preencha a data final da repetição.'); return }
    setSaving(true)

    const cor = CORES_MATERIA[form.materia] || '#2563EB'
    const registros = []
    const dtBase = new Date(form.data)
    const dtFimRep = dataFimRep ? new Date(dataFimRep) : dtBase
    let dtAtual = new Date(dtBase)

    while (dtAtual <= dtFimRep) {
      const dtInicio = new Date(`${dtAtual.toISOString().split('T')[0]}T${form.hora_inicio}`)
      const dtFim = new Date(`${dtAtual.toISOString().split('T')[0]}T${form.hora_fim}`)
      registros.push({
        tipo: 'estudo', titulo: `Estudo de ${form.materia}`,
        materia: form.materia, professor: form.professor,
        descricao: form.descricao, cor,
        data_inicio: dtInicio.toISOString(), data_fim: dtFim.toISOString(),
        aluno_id: form.aluno_id,
        criado_por: 'mentor', criado_por_id: perfil?.id,
      })
      if (repeticao === 'nenhuma') break
      else if (repeticao === 'semanal') dtAtual.setDate(dtAtual.getDate() + 7)
      else if (repeticao === 'quinzenal') dtAtual.setDate(dtAtual.getDate() + 14)
      else if (repeticao === 'mensal') dtAtual.setMonth(dtAtual.getMonth() + 1)
    }

    const { error } = await dbInsert('atividades', registros)
    if (error) { setErro(error.message); setSaving(false) }
    else {
      const msg = registros.length > 1 ? `${registros.length} estudos adicionados!` : 'Estudo adicionado!'
      setForm(f => ({ ...f, descricao: '', data: new Date().toISOString().split('T')[0] }))
      setRepeticao('nenhuma'); setDataFimRep(''); setErro('')
      alert(msg)
    }
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>←</button>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Cadastrar estudo</div>
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
          <label>Matéria</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {materias.map(m => {
              const cor = CORES_MATERIA[m] || '#2563EB'
              return (
                <button key={m} onClick={() => setForm({ ...form, materia: m })} style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 11,
                  border: `1.5px solid ${form.materia === m ? cor : 'rgba(0,0,0,0.12)'}`,
                  background: form.materia === m ? cor : 'transparent',
                  color: form.materia === m ? 'white' : '#666',
                  cursor: 'pointer', fontFamily: 'DM Sans,sans-serif'
                }}>{m}</button>
              )
            })}
          </div>
        </div>
        <div><label>Professor (opcional)</label><input value={form.professor} onChange={e => setForm({ ...form, professor: e.target.value })} placeholder="Nome do professor" /></div>
        <div><label>Observações / comentários</label><textarea value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} placeholder="Instruções para o aluno..." rows={3} style={{ resize: 'vertical' }} /></div>
        <div><label>Data</label><input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} /></div>

        {/* Repetição */}
        <div>
          <label>Repetição</label>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {[
              { val: 'nenhuma', label: 'Não repetir' },
              { val: 'semanal', label: 'Semanal' },
              { val: 'quinzenal', label: 'Quinzenal' },
              { val: 'mensal', label: 'Mensal' },
            ].map(op => (
              <button key={op.val} onClick={() => setRepeticao(op.val)} style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 12,
                border: '0.5px solid rgba(0,0,0,0.12)',
                background: repeticao === op.val ? '#2563EB' : 'transparent',
                color: repeticao === op.val ? 'white' : '#666',
                cursor: 'pointer', fontFamily: 'DM Sans,sans-serif'
              }}>{op.label}</button>
            ))}
          </div>
        </div>

        {repeticao !== 'nenhuma' && (
          <div>
            <label>Repetir até</label>
            <input type="date" value={dataFimRep} onChange={e => setDataFimRep(e.target.value)} min={form.data} />
            <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
              {dataFimRep && form.data && (() => {
                const diff = Math.floor((new Date(dataFimRep).getTime() - new Date(form.data).getTime()) / 86400000)
                const saltos = repeticao === 'semanal' ? 7 : repeticao === 'quinzenal' ? 14 : 30
                const count = Math.floor(diff / saltos) + 1
                return `Serão criados ${count} registro${count !== 1 ? 's' : ''}`
              })()}
            </div>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label>Início</label><input type="time" value={form.hora_inicio} onChange={e => setForm({ ...form, hora_inicio: e.target.value })} /></div>
          <div><label>Fim</label><input type="time" value={form.hora_fim} onChange={e => setForm({ ...form, hora_fim: e.target.value })} /></div>
        </div>
        {form.materia && (
          <div style={{ background: CORES_MATERIA[form.materia] + '20', border: `1px solid ${CORES_MATERIA[form.materia]}30`, borderRadius: 10, padding: 12, fontSize: 12 }}>
            <span style={{ color: CORES_MATERIA[form.materia], fontWeight: 600 }}>■</span> Estudo de {form.materia} — {form.hora_inicio} às {form.hora_fim}
          </div>
        )}
        {erro && <div style={{ color: '#DC2626', fontSize: 13 }}>{erro}</div>}
        <button className="btn-primary" onClick={salvar} disabled={saving}>{saving ? 'Salvando...' : 'Adicionar estudo'}</button>
        <button className="btn-secondary" onClick={() => router.back()}>Cancelar</button>
      </div>
      <Nav />
    </div>
  )
}
