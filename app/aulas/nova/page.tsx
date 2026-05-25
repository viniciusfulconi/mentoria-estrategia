'use client'
import { useEffect, useState } from 'react'
import { dbQuery, dbInsert } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Nav from '@/components/Nav'

function ytIdFromUrl(url: string) {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1)
    return u.searchParams.get('v') || ''
  } catch { return '' }
}

type Tipo = 'video' | 'video_pdf' | 'pdf'

export default function NovaAula() {
  const router = useRouter()
  const { perfil } = useAuth()
  const [turmas, setTurmas] = useState<any[]>([])
  const [tipo, setTipo] = useState<Tipo>('video')
  const [form, setForm] = useState({ titulo: '', youtube_url: '', turma_id: '', materia: 'Física', duracao: '', pdf_url: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState('')

  useEffect(() => {
    if (perfil && perfil.papel !== 'coordenador') { router.replace('/aulas'); return }
    dbQuery('turmas').then(({ data }) => setTurmas(data || []))
  }, [perfil])

  function handleUrl(url: string) {
    setForm(f => ({ ...f, youtube_url: url }))
    const id = ytIdFromUrl(url)
    setPreview(id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : '')
  }

  async function salvar() {
    if (!form.titulo) { setError('Preencha o título.'); return }
    if (tipo !== 'pdf' && !form.youtube_url) { setError('Preencha a URL do YouTube.'); return }
    if (tipo !== 'video' && !form.pdf_url) { setError('Preencha a URL do PDF.'); return }

    const youtube_id = tipo !== 'pdf' ? ytIdFromUrl(form.youtube_url) : null
    if (tipo !== 'pdf' && !youtube_id) { setError('URL do YouTube inválida.'); return }

    setSaving(true)
    const { error: err } = await dbInsert('aulas', [{
      titulo: form.titulo,
      youtube_url: tipo !== 'pdf' ? form.youtube_url : null,
      youtube_id: tipo !== 'pdf' ? youtube_id : null,
      pdf_url: tipo !== 'video' ? form.pdf_url : null,
      turma_id: form.turma_id || null,
      materia: form.materia,
      duracao: form.duracao || '—',
    }])
    if (err) { setError(err); setSaving(false) }
    else router.push('/aulas')
  }

  const materias = ['Física', 'Matemática', 'Química', 'Biologia', 'Português', 'Redação', 'Inglês', 'Mentoria', 'Outra']

  const tipoOpcoes: { value: Tipo; label: string; desc: string }[] = [
    { value: 'video', label: 'Vídeo', desc: 'Apenas vídeo do YouTube' },
    { value: 'video_pdf', label: 'Vídeo + PDF', desc: 'Vídeo com material em PDF' },
    { value: 'pdf', label: 'Apenas PDF', desc: 'Sem vídeo, só o documento' },
  ]

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>←</button>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Nova aula</div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Tipo */}
        <div>
          <label>Tipo de material</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            {tipoOpcoes.map(o => (
              <button
                key={o.value}
                onClick={() => setTipo(o.value)}
                style={{
                  flex: 1, padding: '10px 8px', borderRadius: 12, border: `1.5px solid ${tipo === o.value ? '#2563EB' : 'rgba(0,0,0,0.1)'}`,
                  background: tipo === o.value ? '#EFF6FF' : 'white', cursor: 'pointer',
                  fontFamily: 'DM Sans, sans-serif', textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: tipo === o.value ? '#2563EB' : '#1a1a1a' }}>{o.label}</div>
                <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>{o.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* YouTube URL */}
        {tipo !== 'pdf' && (
          <div>
            <label>Link do YouTube</label>
            <input value={form.youtube_url} onChange={e => handleUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." />
          </div>
        )}
        {preview && <img src={preview} alt="preview" style={{ width: '100%', borderRadius: 12, aspectRatio: '16/9', objectFit: 'cover' }} />}

        {/* PDF URL */}
        {tipo !== 'video' && (
          <div>
            <label>Link do PDF</label>
            <input
              value={form.pdf_url}
              onChange={e => setForm(f => ({ ...f, pdf_url: e.target.value }))}
              placeholder="https://... (Supabase Storage, Google Drive /preview, etc.)"
            />
            <div style={{ fontSize: 11, color: '#999', marginTop: 5, lineHeight: 1.5 }}>
              Google Drive: use o link de <strong>/preview</strong> (não /view).<br />
              Ex: <span style={{ fontFamily: 'monospace', fontSize: 10 }}>drive.google.com/file/d/ID/<strong>preview</strong></span>
            </div>
          </div>
        )}

        <div><label>Título da aula</label><input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Ex: Cinemática — revisão completa" /></div>

        <div>
          <label>Turma (opcional)</label>
          <select value={form.turma_id} onChange={e => setForm({ ...form, turma_id: e.target.value })}>
            <option value="">Todas as turmas</option>
            {turmas.map((t: any) => <option key={t.id} value={t.id}>{t.nome} ({t.tipo})</option>)}
          </select>
        </div>

        <div>
          <label>Matéria</label>
          <select value={form.materia} onChange={e => setForm({ ...form, materia: e.target.value })}>
            {materias.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {tipo !== 'pdf' && (
          <div><label>Duração (ex: 42 min)</label><input value={form.duracao} onChange={e => setForm({ ...form, duracao: e.target.value })} placeholder="42 min" /></div>
        )}

        {error && <div style={{ color: '#DC2626', fontSize: 13 }}>{error}</div>}
        <button className="btn-primary" onClick={salvar} disabled={saving} style={{ marginTop: 8 }}>{saving ? 'Salvando...' : 'Salvar aula'}</button>
        <button className="btn-secondary" onClick={() => router.back()}>Cancelar</button>
      </div>
      <Nav />
    </div>
  )
}
