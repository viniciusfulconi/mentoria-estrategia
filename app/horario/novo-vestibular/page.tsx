'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'

export default function NovoVestibular() {
  const { perfil } = useAuth()
  const router = useRouter()
  const [turmas, setTurmas] = useState<any[]>([])
  const [form, setForm] = useState({ turma_id: '', nome: '', data: '', hora_inicio: '08:00', hora_fim: '13:00', link_edital: '' })
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => { supabase.from('turmas').select('*').then(({ data }) => setTurmas(data || [])) }, [])

  async function salvar() {
    if (!form.nome || !form.data) { setErro('Preencha nome e data.'); return }
    setSaving(true)
    const dtInicio = new Date(`${form.data}T${form.hora_inicio}`)
    const dtFim = new Date(`${form.data}T${form.hora_fim}`)
    const { error } = await supabase.from('atividades').insert([{
      tipo: 'vestibular', titulo: form.nome, turma_id: form.turma_id || null,
      data_inicio: dtInicio.toISOString(), data_fim: dtFim.toISOString(),
      link_edital: form.link_edital,
      criado_por: 'coordenador', criado_por_id: perfil?.id,
    }])
    if (error) { setErro(error.message); setSaving(false) }
    else router.push('/horario')
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>←</button>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Prova de vestibular</div>
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div><label>Turma (opcional)</label><select value={form.turma_id} onChange={e => setForm({ ...form, turma_id: e.target.value })}><option value="">Todas as turmas</option>{turmas.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}</select></div>
        <div><label>Nome da prova</label><input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex: ITA 2026 — 1ª Fase" /></div>
        <div><label>Data</label><input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label>Início</label><input type="time" value={form.hora_inicio} onChange={e => setForm({ ...form, hora_inicio: e.target.value })} /></div>
          <div><label>Fim</label><input type="time" value={form.hora_fim} onChange={e => setForm({ ...form, hora_fim: e.target.value })} /></div>
        </div>
        <div><label>Link do edital (Google Drive)</label><input value={form.link_edital} onChange={e => setForm({ ...form, link_edital: e.target.value })} placeholder="https://drive.google.com/..." /></div>
        {form.data && <div style={{ background: '#212121', color: 'white', borderRadius: 10, padding: 12, fontSize: 12 }}>🎓 {form.nome || 'Prova'} — {new Date(form.data + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</div>}
        {erro && <div style={{ color: '#E24B4A', fontSize: 13 }}>{erro}</div>}
        <button className="btn-primary" onClick={salvar} disabled={saving}>{saving ? 'Salvando...' : 'Cadastrar prova'}</button>
        <button className="btn-secondary" onClick={() => router.back()}>Cancelar</button>
      </div>
      <Nav />
    </div>
  )
}
