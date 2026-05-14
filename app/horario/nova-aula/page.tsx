'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'
import { DIAS_SEMANA } from '@/lib/agenda'

export default function NovaAula() {
  const { perfil } = useAuth()
  const router = useRouter()
  const [turmas, setTurmas] = useState<any[]>([])
  const [materias, setMaterias] = useState<string[]>([])
  const [form, setForm] = useState({
    turma_id: '', materia: '', professor: '', dia_semana: '1',
    hora_inicio: '08:00', hora_fim: '09:30',
    recorrencia_inicio: new Date().toISOString().split('T')[0],
    recorrencia_fim: '', frequencia: 'semanal'
  })
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    Promise.all([
      supabase.from('turmas').select('*'),
      supabase.from('topicos').select('materia')
    ]).then(([{ data: t }, { data: m }]) => {
      setTurmas(t || [])
      const ms = [...new Set((m || []).map((x: any) => x.materia))].sort() as string[]
      setMaterias(ms)
    })
  }, [])

  async function salvar() {
    if (!form.turma_id || !form.materia || !form.hora_inicio || !form.hora_fim || !form.recorrencia_fim) {
      setErro('Preencha todos os campos obrigatórios.'); return
    }
    setSaving(true)

    const [hi, hm] = form.hora_inicio.split(':').map(Number)
    const [fi, fm] = form.hora_fim.split(':').map(Number)
    const dtFimRep = new Date(form.recorrencia_fim)

    if (form.frequencia === 'semanal') {
      // Recorrência semanal — salva 1 registro com flag recorrente
      const base = new Date(form.recorrencia_inicio)
      base.setHours(hi, hm, 0, 0)
      const baseFim = new Date(form.recorrencia_inicio)
      baseFim.setHours(fi, fm, 0, 0)
      const { error } = await supabase.from('atividades').insert([{
        tipo: 'aula', titulo: `Aula de ${form.materia}`,
        materia: form.materia, professor: form.professor,
        data_inicio: base.toISOString(), data_fim: baseFim.toISOString(),
        recorrente: true, dia_semana: Number(form.dia_semana),
        recorrencia_inicio: form.recorrencia_inicio,
        recorrencia_fim: form.recorrencia_fim,
        turma_id: form.turma_id, criado_por: 'coordenador', criado_por_id: perfil?.id,
      }])
      if (error) { setErro(error.message); setSaving(false); return }
    } else {
      // Quinzenal ou mensal — cria registros individuais
      const registros = []
      let dtAtual = new Date(form.recorrencia_inicio)
      // Ajusta para o dia da semana correto
      const diaSemana = Number(form.dia_semana)
      while (dtAtual.getDay() !== diaSemana) dtAtual.setDate(dtAtual.getDate() + 1)

      while (dtAtual <= dtFimRep) {
        const dtInicio = new Date(dtAtual)
        dtInicio.setHours(hi, hm, 0, 0)
        const dtFim = new Date(dtAtual)
        dtFim.setHours(fi, fm, 0, 0)
        registros.push({
          tipo: 'aula', titulo: `Aula de ${form.materia}`,
          materia: form.materia, professor: form.professor,
          data_inicio: dtInicio.toISOString(), data_fim: dtFim.toISOString(),
          turma_id: form.turma_id, criado_por: 'coordenador', criado_por_id: perfil?.id,
        })
        if (form.frequencia === 'quinzenal') dtAtual.setDate(dtAtual.getDate() + 14)
        else dtAtual.setMonth(dtAtual.getMonth() + 1)
      }
      const { error } = await supabase.from('atividades').insert(registros)
      if (error) { setErro(error.message); setSaving(false); return }
    }

    router.push('/horario')
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>←</button>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Nova aula recorrente</div>
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label>Turma</label>
          <select value={form.turma_id} onChange={e => setForm({ ...form, turma_id: e.target.value })}>
            <option value="">Selecione</option>
            {turmas.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </div>
        <div>
          <label>Matéria</label>
          <select value={form.materia} onChange={e => setForm({ ...form, materia: e.target.value })}>
            <option value="">Selecione</option>
            {materias.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div><label>Professor</label><input value={form.professor} onChange={e => setForm({ ...form, professor: e.target.value })} placeholder="Nome do professor" /></div>
        <div>
          <label>Dia da semana</label>
          <select value={form.dia_semana} onChange={e => setForm({ ...form, dia_semana: e.target.value })}>
            {DIAS_SEMANA.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </div>
        {/* Frequência */}
        <div>
          <label>Frequência</label>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            {[
              { val: 'semanal', label: 'Semanal' },
              { val: 'quinzenal', label: 'Quinzenal' },
              { val: 'mensal', label: 'Mensal' },
            ].map(op => (
              <button key={op.val} onClick={() => setForm({ ...form, frequencia: op.val })} style={{
                flex: 1, padding: '8px', borderRadius: 10, fontSize: 12,
                border: `1.5px solid ${form.frequencia === op.val ? '#534AB7' : 'rgba(0,0,0,0.1)'}`,
                background: form.frequencia === op.val ? '#EEEDFE' : 'transparent',
                color: form.frequencia === op.val ? '#534AB7' : '#666',
                cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontWeight: 500
              }}>{op.label}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label>Início</label><input type="time" value={form.hora_inicio} onChange={e => setForm({ ...form, hora_inicio: e.target.value })} /></div>
          <div><label>Fim</label><input type="time" value={form.hora_fim} onChange={e => setForm({ ...form, hora_fim: e.target.value })} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label>De</label><input type="date" value={form.recorrencia_inicio} onChange={e => setForm({ ...form, recorrencia_inicio: e.target.value })} /></div>
          <div><label>Até</label><input type="date" value={form.recorrencia_fim} onChange={e => setForm({ ...form, recorrencia_fim: e.target.value })} /></div>
        </div>
        {form.materia && form.dia_semana && form.hora_inicio && (
          <div style={{ background: '#E8E8E8', borderRadius: 10, padding: 12, fontSize: 12, color: '#444' }}>
            📅 {form.frequencia === 'semanal' ? 'Toda' : form.frequencia === 'quinzenal' ? 'A cada 2 semanas, na' : 'Todo mês, na'} {DIAS_SEMANA[Number(form.dia_semana)]}, das {form.hora_inicio} às {form.hora_fim}, aula de {form.materia}{form.professor ? ` com ${form.professor}` : ''}
          </div>
        )}
        {erro && <div style={{ color: '#E24B4A', fontSize: 13 }}>{erro}</div>}
        <button className="btn-primary" onClick={salvar} disabled={saving}>{saving ? 'Salvando...' : 'Criar aula'}</button>
        <button className="btn-secondary" onClick={() => router.back()}>Cancelar</button>
      </div>
      <Nav />
    </div>
  )
}
