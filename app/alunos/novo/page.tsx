'use client'
import { useEffect, useState } from 'react'
import { dbQuery, dbInsert } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'

export default function NovoAluno() {
  const router = useRouter()
  const [turmas, setTurmas] = useState<any[]>([])
  const [mentores, setMentores] = useState<any[]>([])
  const [form, setForm] = useState({ nome:'', email:'', turma_id:'', mentor_id:'' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      dbQuery('turmas'),
      dbQuery('mentores'),
    ]).then(([{data:t},{data:m}]) => { setTurmas(t||[]); setMentores(m||[]) })
  }, [])

  const mentoresFiltrados = form.turma_id ? mentores.filter(m=>m.turma_id===form.turma_id) : mentores

  async function salvar() {
    if (!form.nome || !form.turma_id) { setError('Preencha nome e turma.'); return }
    setSaving(true)
    const { error: err } = await dbInsert('alunos', [{
      nome: form.nome, email: form.email, turma_id: form.turma_id,
      mentor_id: form.mentor_id || null
    }])
    if (err) { setError(err); setSaving(false) }
    else router.push('/alunos')
  }

  return (
    <div style={{ paddingBottom:80 }}>
      <div style={{ background:'white', borderBottom:'0.5px solid rgba(0,0,0,0.08)', padding:'16px', position:'sticky', top:0, zIndex:10, display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={() => router.back()} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#999' }}>←</button>
        <div style={{ fontSize:17, fontWeight:600 }}>Novo aluno</div>
      </div>
      <div style={{ padding:16, display:'flex', flexDirection:'column', gap:14 }}>
        <div><label>Nome completo</label><input value={form.nome} onChange={e=>setForm({...form,nome:e.target.value})} placeholder="Ex: Lucas Ferreira" /></div>
        <div><label>E-mail</label><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="email@exemplo.com" /></div>
        <div>
          <label>Turma</label>
          <select value={form.turma_id} onChange={e=>setForm({...form,turma_id:e.target.value,mentor_id:''})}>
            <option value="">Selecione a turma</option>
            {turmas.map((t:any) => <option key={t.id} value={t.id}>{t.nome} ({t.tipo})</option>)}
          </select>
        </div>
        <div>
          <label>Mentor responsável</label>
          <select value={form.mentor_id} onChange={e=>setForm({...form,mentor_id:e.target.value})}>
            <option value="">Sem mentor atribuído</option>
            {mentoresFiltrados.map((m:any) => <option key={m.id} value={m.id}>{m.nome} — {m.materia}</option>)}
          </select>
        </div>
        {error && <div style={{ color:'#DC2626', fontSize:13 }}>{error}</div>}
        <button className="btn-primary" onClick={salvar} disabled={saving} style={{ marginTop:8 }}>{saving?'Salvando...':'Salvar aluno'}</button>
        <button className="btn-secondary" onClick={() => router.back()}>Cancelar</button>
      </div>
      <Nav />
    </div>
  )
}
