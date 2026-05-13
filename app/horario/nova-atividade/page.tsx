'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'

const CORES_PESSOAL = ['#26A69A', '#AB47BC', '#EC407A', '#FF7043', '#8D6E63', '#78909C']

export default function NovaAtividade() {
  const { perfil } = useAuth()
  const router = useRouter()
  const [form, setForm] = useState({ titulo: '', descricao: '', data: new Date().toISOString().split('T')[0], hora_inicio: '08:00', hora_fim: '09:00', cor: CORES_PESSOAL[0] })
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  async function salvar() {
    if (!form.titulo || !form.data) { setErro('Preencha título e data.'); return }
    setSaving(true)
    const dtInicio = new Date(`${form.data}T${form.hora_inicio}`)
    const dtFim = new Date(`${form.data}T${form.hora_fim}`)
    const { error } = await supabase.from('atividades').insert([{
      tipo: 'pessoal', titulo: form.titulo, descricao: form.descricao,
      data_inicio: dtInicio.toISOString(), data_fim: dtFim.toISOString(),
      cor: form.cor, aluno_id: perfil?.aluno_id,
      criado_por: 'aluno', criado_por_id: perfil?.id,
    }])
    if (error) { setErro(error.message); setSaving(false) }
    else router.push('/horario')
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>←</button>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Nova atividade pessoal</div>
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div><label>Título</label><input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Ex: Revisão de exercícios" /></div>
        <div><label>Descrição (opcional)</label><textarea value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} placeholder="Observações..." rows={3} style={{ resize: 'vertical' }} /></div>
        <div><label>Data</label><input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label>Início</label><input type="time" value={form.hora_inicio} onChange={e => setForm({ ...form, hora_inicio: e.target.value })} /></div>
          <div><label>Fim</label><input type="time" value={form.hora_fim} onChange={e => setForm({ ...form, hora_fim: e.target.value })} /></div>
        </div>
        <div>
          <label>Cor</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            {CORES_PESSOAL.map(c => (
              <button key={c} onClick={() => setForm({ ...form, cor: c })} style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: form.cor === c ? '3px solid #1a1a1a' : '2px solid transparent', cursor: 'pointer' }} />
            ))}
          </div>
        </div>
        {erro && <div style={{ color: '#E24B4A', fontSize: 13 }}>{erro}</div>}
        <button className="btn-primary" onClick={salvar} disabled={saving}>{saving ? 'Salvando...' : 'Salvar atividade'}</button>
        <button className="btn-secondary" onClick={() => router.back()}>Cancelar</button>
      </div>
      <Nav />
    </div>
  )
}
