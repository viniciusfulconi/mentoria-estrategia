'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'

export default function NovaTurma() {
  const router = useRouter()
  const [form, setForm] = useState({ nome:'', tipo:'ITA', ano: new Date().getFullYear(), orcamento_total:'' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function salvar() {
    if (!form.nome) { setError('Preencha o nome da turma.'); return }
    setSaving(true)
    const { error: err } = await supabase.from('turmas').insert([{
      nome: form.nome, tipo: form.tipo, ano: Number(form.ano),
      orcamento_total: Number(form.orcamento_total) || 0
    }])
    if (err) { setError(err.message); setSaving(false) }
    else router.push('/turmas')
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background:'white', borderBottom:'0.5px solid rgba(0,0,0,0.08)', padding:'16px', position:'sticky', top:0, zIndex:10, display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={() => router.back()} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#999' }}>←</button>
        <div style={{ fontSize:17, fontWeight:600 }}>Nova turma</div>
      </div>
      <div style={{ padding:16, display:'flex', flexDirection:'column', gap:14 }}>
        <div>
          <label>Nome da turma</label>
          <input value={form.nome} onChange={e => setForm({...form, nome:e.target.value})} placeholder="Ex: Turma ITA 2025" />
        </div>
        <div>
          <label>Tipo</label>
          <select value={form.tipo} onChange={e => setForm({...form, tipo:e.target.value})}>
            <option value="ITA">ITA</option>
            <option value="Medicina">Medicina</option>
          </select>
        </div>
        <div>
          <label>Ano</label>
          <input type="number" value={form.ano} onChange={e => setForm({...form, ano:Number(e.target.value)})} />
        </div>
        <div>
          <label>Orçamento total (R$)</label>
          <input type="number" value={form.orcamento_total} onChange={e => setForm({...form, orcamento_total:e.target.value})} placeholder="Ex: 10000" />
        </div>
        {error && <div style={{ color:'#DC2626', fontSize:13 }}>{error}</div>}
        <button className="btn-primary" onClick={salvar} disabled={saving} style={{ marginTop:8 }}>
          {saving ? 'Salvando...' : 'Salvar turma'}
        </button>
        <button className="btn-secondary" onClick={() => router.back()}>Cancelar</button>
      </div>
      <Nav />
    </div>
  )
}
