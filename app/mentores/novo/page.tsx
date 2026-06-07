'use client'
import { useEffect, useState } from 'react'
import { dbQuery, dbInsert } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'

export default function NovoMentor() {
  const router = useRouter()
  const { verticalAtiva } = useAuth()
  const vertical = verticalAtiva || 'ITA'
  const [turmas, setTurmas] = useState<any[]>([])
  const [form, setForm] = useState({ nome:'', email:'', turma_id:'', valor_por_atendimento:'', nota_media:'5' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    dbQuery('turmas', { tipo: `eq.${vertical}` }).then(({ data }) => setTurmas(data || []))
  }, [vertical])

  async function salvar() {
    if (!form.nome) { setError('Preencha o nome.'); return }
    setSaving(true)
    const { error: err } = await dbInsert('mentores', [{
      nome: form.nome, email: form.email,
      turma_id: form.turma_id || null,
      valor_por_atendimento: Number(form.valor_por_atendimento)||0,
      nota_media: Number(form.nota_media)||5, total_atendimentos: 0,
      vertical, aceitando_alunos: true,
    }])
    if (err) { setError(err); setSaving(false) }
    else router.push('/mentores')
  }

  return (
    <div style={{ paddingBottom:80 }}>
      <div style={{ background:'white', borderBottom:'0.5px solid rgba(0,0,0,0.08)', padding:'16px', position:'sticky', top:0, zIndex:10, display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={() => router.back()} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#999' }}>←</button>
        <div style={{ fontSize:17, fontWeight:600 }}>Novo mentor</div>
      </div>
      <div style={{ padding:16, display:'flex', flexDirection:'column', gap:14 }}>
        <div><label>Nome completo</label><input value={form.nome} onChange={e=>setForm({...form,nome:e.target.value})} placeholder="Ex: Rafael Moura" /></div>
        <div><label>E-mail</label><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="email@exemplo.com" /></div>
        <div>
          <label>Turma</label>
          <select value={form.turma_id} onChange={e=>setForm({...form,turma_id:e.target.value})}>
            <option value="">Selecione a turma</option>
            {turmas.map((t:any) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </div>
        <div><label>Valor por atendimento (R$)</label><input type="number" value={form.valor_por_atendimento} onChange={e=>setForm({...form,valor_por_atendimento:e.target.value})} placeholder="Ex: 40" /></div>
        {error && <div style={{ color:'#DC2626', fontSize:13 }}>{error}</div>}
        <button className="btn-primary" onClick={salvar} disabled={saving} style={{ marginTop:8 }}>{saving?'Salvando...':'Salvar mentor'}</button>
        <button className="btn-secondary" onClick={() => router.back()}>Cancelar</button>
      </div>
      <Nav />
    </div>
  )
}
