'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'
import * as XLSX from 'xlsx'

export default function NovoCronograma() {
  const router = useRouter()
  const [concursos, setConcursos] = useState<any[]>([])
  const [nome, setNome] = useState('')
  const [logo, setLogo] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState('')
  const [planilha, setPlanilha] = useState<File | null>(null)
  const [topicosPreview, setTopicosPreview] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [modo, setModo] = useState<'novo' | 'editar'>('novo')
  const [concursoAtual, setConcursoAtual] = useState<any>(null)

  useEffect(() => {
    supabase.from('concursos').select('*').order('created_at', { ascending: false })
      .then(({ data }) => {
        setConcursos(data || [])
        if (data && data.length > 0) {
          setModo('editar')
          setConcursoAtual(data[0])
          setNome(data[0].nome)
          setLogoPreview(data[0].logo_url || '')
        }
      })
  }, [])

  function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setLogo(f)
    setLogoPreview(URL.createObjectURL(f))
  }

  function handlePlanilha(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setPlanilha(f)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target?.result, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][]
      const parsed = rows.filter(r => r[0] && r[1]).map(r => ({
        materia: String(r[0]).trim(),
        topico: String(r[1]).trim(),
        incidencia: Number(r[2]) || 0,
      }))
      setTopicosPreview(parsed)
    }
    reader.readAsArrayBuffer(f)
  }

  function addLog(msg: string) { setLog(prev => [...prev, msg]) }

  async function salvar() {
    if (!nome) { addLog('❌ Digite o nome do concurso.'); return }
    setSaving(true); setLog([])

    let logoUrl = concursoAtual?.logo_url || ''

    // Upload logo se tiver
    if (logo) {
      addLog('📸 Fazendo upload do logo...')
      const ext = logo.name.split('.').pop()
      const path = `logos/${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('cronograma')
        .upload(path, logo, { upsert: true })
      if (uploadErr) {
        addLog(`⚠ Erro no logo: ${uploadErr.message} — continuando sem logo`)
      } else {
        const { data } = supabase.storage.from('cronograma').getPublicUrl(path)
        logoUrl = data.publicUrl
        addLog('✅ Logo enviado!')
      }
    }

    // Criar ou atualizar concurso
    let concursoId = concursoAtual?.id
    if (!concursoId) {
      addLog('📋 Criando concurso...')
      const { data, error } = await supabase.from('concursos').insert([{ nome, logo_url: logoUrl }]).select().single()
      if (error) { addLog(`❌ ${error.message}`); setSaving(false); return }
      concursoId = data.id
    } else {
      await supabase.from('concursos').update({ nome, logo_url: logoUrl }).eq('id', concursoId)
      addLog('✅ Concurso atualizado!')
    }

    // Importar tópicos se tiver planilha
    if (topicosPreview.length > 0) {
      addLog(`📊 Importando ${topicosPreview.length} tópicos...`)

      // Remove tópicos antigos
      await supabase.from('topicos').delete().eq('concurso_id', concursoId)

      const records = topicosPreview.map(t => ({
        concurso_id: concursoId,
        materia: t.materia,
        topico: t.topico,
        incidencia: t.incidencia,
      }))

      const { error: topErr } = await supabase.from('topicos').insert(records)
      if (topErr) { addLog(`❌ Erro tópicos: ${topErr.message}`) }
      else addLog(`✅ ${records.length} tópicos importados!`)

      // Limpa progresso existente pois tópicos mudaram
      await supabase.from('progresso_topicos').delete().eq('topico_id', 'all')
    }

    addLog('🎉 Cronograma salvo com sucesso!')
    setTimeout(() => router.push('/cronograma'), 1500)
    setSaving(false)
  }

  const materias = [...new Set(topicosPreview.map(t => t.materia))]

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>←</button>
        <div style={{ fontSize: 17, fontWeight: 600 }}>{modo === 'novo' ? 'Novo cronograma' : 'Editar cronograma'}</div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Dados do concurso */}
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Dados do concurso</div>
          <div style={{ marginBottom: 12 }}>
            <label>Nome do concurso</label>
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: ITA 2026" />
          </div>
          <div>
            <label>Logo da instituição (opcional)</label>
            <input type="file" accept="image/*" onChange={handleLogo} style={{ padding: '8px', borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.12)', background: '#F7F6F3', fontSize: 13, width: '100%' }} />
            {logoPreview && (
              <img src={logoPreview} alt="logo" style={{ width: 80, height: 80, borderRadius: 12, objectFit: 'cover', marginTop: 10 }} />
            )}
          </div>
        </div>

        {/* Upload planilha */}
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Planilha de tópicos</div>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 14, lineHeight: 1.6 }}>
            Coluna A: Matéria · Coluna B: Tópico · Coluna C: Incidência (0 a 1)
          </div>
          <input type="file" accept=".xlsx,.xls" onChange={handlePlanilha}
            style={{ padding: '8px', borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.12)', background: '#F7F6F3', fontSize: 13, width: '100%' }} />

          {topicosPreview.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, color: '#1D9E75', marginBottom: 8 }}>✅ {topicosPreview.length} tópicos · {materias.length} matérias detectadas</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {materias.map(m => (
                  <span key={m} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 10, background: '#EEEDFE', color: '#3C3489' }}>{m}</span>
                ))}
              </div>
              <div style={{ marginTop: 10, maxHeight: 200, overflowY: 'auto', fontSize: 11, color: '#666' }}>
                {topicosPreview.slice(0, 5).map((t, i) => (
                  <div key={i} style={{ padding: '3px 0', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
                    <span style={{ color: '#534AB7', fontWeight: 500 }}>{t.materia}</span> · {t.topico} · <span style={{ color: '#EF9F27' }}>{(t.incidencia * 100).toFixed(0)}%</span>
                  </div>
                ))}
                {topicosPreview.length > 5 && <div style={{ color: '#999', marginTop: 4 }}>... e mais {topicosPreview.length - 5} tópicos</div>}
              </div>
            </div>
          )}
        </div>

        {/* Log */}
        {log.length > 0 && (
          <div className="card">
            <div style={{ fontFamily: 'monospace', fontSize: 11, lineHeight: 2 }}>
              {log.map((l, i) => (
                <div key={i} style={{ color: l.startsWith('❌') ? '#E24B4A' : l.startsWith('✅') || l.startsWith('🎉') ? '#1D9E75' : '#666' }}>{l}</div>
              ))}
            </div>
          </div>
        )}

        <button className="btn-primary" onClick={salvar} disabled={saving}>
          {saving ? 'Salvando...' : modo === 'novo' ? 'Criar cronograma' : 'Salvar alterações'}
        </button>
        <button className="btn-secondary" onClick={() => router.back()}>Cancelar</button>
      </div>
      <Nav />
    </div>
  )
}
