'use client'
import { useState, useEffect } from 'react'
import { supabase, dbQuery, dbInsert, dbUpdate } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Nav from '@/components/Nav'

export default function NovoCronograma() {
  const router = useRouter()
  const { verticalAtiva } = useAuth()
  const vertical = verticalAtiva || 'ITA'
  const [concursos, setConcursos] = useState<any[]>([])
  const [nome, setNome] = useState('')
  const [logo, setLogo] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState('')
  const [saving, setSaving] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [modo, setModo] = useState<'novo' | 'editar'>('novo')
  const [concursoAtual, setConcursoAtual] = useState<any>(null)

  useEffect(() => {
    dbQuery('concursos', { vertical: `eq.${vertical}`, order: 'created_at.desc' }).then(({ data }) => {
      setConcursos(data || [])
      if (data && data.length > 0) {
        setModo('editar')
        setConcursoAtual(data[0])
        setNome(data[0].nome)
        setLogoPreview(data[0].logo_url || '')
      }
    })
  }, [vertical])

  function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setLogo(f)
    setLogoPreview(URL.createObjectURL(f))
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
      const { data, error } = await dbInsert<any>('concursos', [{ nome, logo_url: logoUrl, vertical }], true)
      if (error) { addLog(`❌ ${error}`); setSaving(false); return }
      concursoId = (data as any)?.[0]?.id
    } else {
      await dbUpdate('concursos', { id: `eq.${concursoId}` }, { nome, logo_url: logoUrl })
      addLog('✅ Concurso atualizado!')
    }

    addLog('🎉 Cronograma salvo com sucesso!')
    setTimeout(() => router.push('/cronograma'), 1500)
    setSaving(false)
  }

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

        {/* Info sobre a árvore */}
        <div className="card" style={{ background: '#f0fdf4', border: '0.5px solid #86efac' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#15803d', marginBottom: 4 }}>✅ Árvore de conteúdo carregada</div>
          <div style={{ fontSize: 12, color: '#166534', lineHeight: 1.6 }}>
            Os tópicos e subtópicos do edital já estão na plataforma (Física, Matemática, Química, Português e Literatura).
            Não é necessário importar planilha.
          </div>
        </div>

        {/* Log */}
        {log.length > 0 && (
          <div className="card">
            <div style={{ fontFamily: 'monospace', fontSize: 11, lineHeight: 2 }}>
              {log.map((l, i) => (
                <div key={i} style={{ color: l.startsWith('❌') ? '#DC2626' : l.startsWith('✅') || l.startsWith('🎉') ? '#16A34A' : '#666' }}>{l}</div>
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
