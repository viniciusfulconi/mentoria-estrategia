'use client'
import { useEffect, useState } from 'react'
import { dbQuery, dbInsert } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'

function ytIdFromUrl(url: string) {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1)
    return u.searchParams.get('v') || ''
  } catch { return '' }
}

export default function NovaAula() {
  const router = useRouter()
  const [turmas, setTurmas] = useState<any[]>([])
  const [form, setForm] = useState({ titulo:'', youtube_url:'', turma_id:'', materia:'Física', duracao:'' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState('')

  useEffect(() => {
    dbQuery('turmas').then(({ data }) => setTurmas(data||[]))
  }, [])

  function handleUrl(url: string) {
    setForm(f => ({...f, youtube_url:url}))
    const id = ytIdFromUrl(url)
    setPreview(id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : '')
  }

  async function salvar() {
    if (!form.titulo || !form.youtube_url) { setError('Preencha título e URL.'); return }
    const youtube_id = ytIdFromUrl(form.youtube_url)
    if (!youtube_id) { setError('URL do YouTube inválida.'); return }
    setSaving(true)
    const { error: err } = await dbInsert('aulas', [{
      titulo: form.titulo, youtube_url: form.youtube_url, youtube_id,
      turma_id: form.turma_id || null, materia: form.materia, duracao: form.duracao || '—'
    }])
    if (err) { setError(err); setSaving(false) }
    else router.push('/aulas')
  }

  const materias = ['Física','Matemática','Química','Biologia','Português','Redação','Inglês','Outra']

  return (
    <div style={{ paddingBottom:80 }}>
      <div style={{ background:'white', borderBottom:'0.5px solid rgba(0,0,0,0.08)', padding:'16px', position:'sticky', top:0, zIndex:10, display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={() => router.back()} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#999' }}>←</button>
        <div style={{ fontSize:17, fontWeight:600 }}>Nova aula</div>
      </div>
      <div style={{ padding:16, display:'flex', flexDirection:'column', gap:14 }}>
        <div>
          <label>Link do YouTube</label>
          <input value={form.youtube_url} onChange={e=>handleUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." />
        </div>
        {preview && <img src={preview} alt="preview" style={{ width:'100%', borderRadius:12, aspectRatio:'16/9', objectFit:'cover' }} />}
        <div><label>Título da aula</label><input value={form.titulo} onChange={e=>setForm({...form,titulo:e.target.value})} placeholder="Ex: Cinemática — revisão completa" /></div>
        <div>
          <label>Turma (opcional)</label>
          <select value={form.turma_id} onChange={e=>setForm({...form,turma_id:e.target.value})}>
            <option value="">Todas as turmas</option>
            {turmas.map((t:any) => <option key={t.id} value={t.id}>{t.nome} ({t.tipo})</option>)}
          </select>
        </div>
        <div>
          <label>Matéria</label>
          <select value={form.materia} onChange={e=>setForm({...form,materia:e.target.value})}>
            {materias.map(m=><option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div><label>Duração (ex: 42 min)</label><input value={form.duracao} onChange={e=>setForm({...form,duracao:e.target.value})} placeholder="42 min" /></div>
        {error && <div style={{ color:'#DC2626', fontSize:13 }}>{error}</div>}
        <button className="btn-primary" onClick={salvar} disabled={saving} style={{ marginTop:8 }}>{saving?'Salvando...':'Salvar aula'}</button>
        <button className="btn-secondary" onClick={() => router.back()}>Cancelar</button>
      </div>
      <Nav />
    </div>
  )
}
