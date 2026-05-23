'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'

export default function DadosPessoais() {
  const { perfil: meuPerfil } = useAuth()
  const router = useRouter()
  const [form, setForm] = useState({ telefone: '', modalidade: 'online', cidade: '' })
  const [foto, setFoto] = useState<File | null>(null)
  const [fotoPreview, setFotoPreview] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!meuPerfil) return
    supabase.from('perfis').select('*').eq('id', meuPerfil.id).single()
      .then(({ data }) => {
        if (data) {
          setForm({
            telefone: data.telefone || '',
            modalidade: data.modalidade || 'online',
            cidade: data.cidade || '',
          })
          setFotoPreview(data.foto_url || '')
        }
      })
  }, [meuPerfil])

  function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFoto(f)
    setFotoPreview(URL.createObjectURL(f))
  }

  async function salvar() {
    if (!meuPerfil) return
    setSaving(true); setMsg('')

    let fotoUrl = fotoPreview

    if (foto) {
      const ext = foto.name.split('.').pop()
      const path = `fotos/${meuPerfil.id}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('avatares').upload(path, foto, { upsert: true })
      if (!uploadErr) {
        const { data } = supabase.storage.from('avatares').getPublicUrl(path)
        fotoUrl = data.publicUrl
      }
    }

    const { error } = await supabase.from('perfis').update({
      telefone: form.telefone,
      modalidade: form.modalidade,
      cidade: form.cidade,
      foto_url: fotoUrl,
    }).eq('id', meuPerfil.id)

    if (error) setMsg('Erro ao salvar: ' + error.message)
    else setMsg('✅ Dados salvos com sucesso!')
    setSaving(false)
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>←</button>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Meus dados</div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Foto */}
        <div className="card" style={{ textAlign: 'center', padding: 24 }}>
          <div style={{ marginBottom: 14 }}>
            {fotoPreview ? (
              <img src={fotoPreview} alt="foto" style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', margin: '0 auto' }} />
            ) : (
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 600, color: '#1E40AF', margin: '0 auto' }}>
                {meuPerfil?.nome?.split(' ').map((w: string) => w[0]).slice(0, 2).join('') || '?'}
              </div>
            )}
          </div>
          <label style={{ display: 'inline-block', background: '#EFF6FF', color: '#2563EB', padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            📷 Alterar foto
            <input type="file" accept="image/*" onChange={handleFoto} style={{ display: 'none' }} />
          </label>
        </div>

        {/* Dados */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label>WhatsApp</label>
            <input value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} placeholder="(11) 99999-9999" />
          </div>
          <div>
            <label>Cidade</label>
            <input value={form.cidade} onChange={e => setForm({ ...form, cidade: e.target.value })} placeholder="Ex: São Paulo - SP" />
          </div>
          <div>
            <label>Modalidade</label>
            <select value={form.modalidade} onChange={e => setForm({ ...form, modalidade: e.target.value })}>
              <option value="online">💻 Online</option>
              <option value="presencial">🏫 Presencial</option>
            </select>
          </div>
        </div>

        {msg && <div style={{ fontSize: 13, color: msg.startsWith('✅') ? '#16A34A' : '#DC2626', textAlign: 'center' }}>{msg}</div>}

        <button className="btn-primary" onClick={salvar} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar dados'}
        </button>
        <button className="btn-secondary" onClick={() => router.back()}>Cancelar</button>
      </div>
      <Nav />
    </div>
  )
}
