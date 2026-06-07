'use client'
import { useEffect, useState } from 'react'
import { dbQuery, dbInsert } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'

export default function NovoSimulado() {
  const { perfil, verticalAtiva } = useAuth()
  const vertical = verticalAtiva || 'ITA'
  const router = useRouter()
  const [turmas, setTurmas] = useState<any[]>([])
  const [materias, setMaterias] = useState<string[]>([])
  const [form, setForm] = useState({ turma_id: '', nome: '', ciclo: '', tipo: 'objetivo', data: '', hora_inicio: '08:00', hora_fim: '13:00' })
  const [materiasSel, setMateriasSel] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    Promise.all([dbQuery('turmas', { tipo: `eq.${vertical}` }), dbQuery('topicos', { vertical: `eq.${vertical}` }, 'materia')])
      .then(([{ data: t }, { data: m }]) => {
        setTurmas(t || [])
        setMaterias([...new Set((m || []).map((x: any) => x.materia))].sort() as string[])
      })
  }, [vertical])

  function toggleMateria(m: string) {
    setMateriasSel(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])
  }

  async function salvar() {
    if (!form.turma_id || !form.nome || !form.data) { setErro('Preencha os campos obrigatórios.'); return }
    setSaving(true)
    const dtInicio = new Date(`${form.data}T${form.hora_inicio}`)
    const dtFim = new Date(`${form.data}T${form.hora_fim}`)
    const { error } = await dbInsert('atividades', [{
      tipo: 'simulado', titulo: form.nome, turma_id: form.turma_id,
      tipo_simulado: form.tipo, ciclo_simulado: form.ciclo,
      materias_simulado: materiasSel,
      data_inicio: dtInicio.toISOString(), data_fim: dtFim.toISOString(),
      criado_por: 'coordenador', criado_por_id: perfil?.id, vertical,
    }])
    if (error) { setErro(error); setSaving(false) }
    else router.push('/horario')
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>←</button>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Novo simulado</div>
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div><label>Turma</label><select value={form.turma_id} onChange={e => setForm({ ...form, turma_id: e.target.value })}><option value="">Selecione</option>{turmas.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}</select></div>
        <div><label>Nome do simulado</label><input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Simulado Ciclo 1 - ITA" /></div>
        <div><label>Ciclo</label><input value={form.ciclo} onChange={e => setForm({ ...form, ciclo: e.target.value })} placeholder="Ex: Ciclo 1" /></div>
        <div><label>Tipo</label><select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}><option value="objetivo">Objetivo</option><option value="dissertativo">Dissertativo</option></select></div>
        <div>
          <label>Matérias envolvidas</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {materias.map(m => (
              <button key={m} onClick={() => toggleMateria(m)} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 11, border: '0.5px solid rgba(0,0,0,0.12)', background: materiasSel.includes(m) ? '#f97316' : 'transparent', color: materiasSel.includes(m) ? 'white' : '#666', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>{m}</button>
            ))}
          </div>
        </div>
        <div><label>Data</label><input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label>Início</label><input type="time" value={form.hora_inicio} onChange={e => setForm({ ...form, hora_inicio: e.target.value })} /></div>
          <div><label>Fim</label><input type="time" value={form.hora_fim} onChange={e => setForm({ ...form, hora_fim: e.target.value })} /></div>
        </div>
        {erro && <div style={{ color: '#DC2626', fontSize: 13 }}>{erro}</div>}
        <button className="btn-primary" onClick={salvar} disabled={saving}>{saving ? 'Salvando...' : 'Criar simulado'}</button>
        <button className="btn-secondary" onClick={() => router.back()}>Cancelar</button>
      </div>
      <Nav />
    </div>
  )
}
