'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'

export default function NovaLista() {
  const { perfil } = useAuth()
  const router = useRouter()
  const [topicos, setTopicos] = useState<any[]>([])
  const [materias, setMaterias] = useState<string[]>([])
  const [form, setForm] = useState({
    materia: '', topico_id: '', topico_nome: '',
    nome: '', acertos: '', total: '', data: new Date().toISOString().split('T')[0]
  })
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    supabase.from('topicos').select('*').order('materia').order('topico')
      .then(({ data }) => {
        setTopicos(data || [])
        const ms = [...new Set((data || []).map((t: any) => t.materia))].sort() as string[]
        setMaterias(ms)
        if (ms.length) setForm(f => ({ ...f, materia: ms[0] }))
      })
  }, [])

  const topicosFiltrados = topicos.filter(t => t.materia === form.materia)

  function selectMateria(mat: string) {
    setForm(f => ({ ...f, materia: mat, topico_id: '', topico_nome: '' }))
  }

  function selectTopico(id: string) {
    const t = topicos.find(t => t.id === id)
    setForm(f => ({ ...f, topico_id: id, topico_nome: t?.topico || '' }))
  }

  async function salvar() {
    if (!form.materia || !form.nome || !form.acertos || !form.total) {
      setErro('Preencha todos os campos obrigatórios.'); return
    }
    const acertos = Number(form.acertos)
    const total = Number(form.total)
    if (acertos > total) { setErro('Acertos não pode ser maior que total.'); return }
    if (total <= 0) { setErro('Total deve ser maior que zero.'); return }

    setSaving(true); setErro('')
    const alunoId = perfil?.aluno_id
    if (!alunoId) { setErro('Aluno não identificado.'); setSaving(false); return }

    const { error } = await supabase.from('listas').insert([{
      aluno_id: alunoId,
      topico_id: form.topico_id || null,
      materia: form.materia,
      topico_nome: form.topico_nome || form.materia,
      nome: form.nome,
      acertos,
      total,
      data: form.data,
    }])

    if (error) { setErro(error.message); setSaving(false) }
    else router.back()
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>←</button>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Nova lista</div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Matéria */}
        <div>
          <label>Matéria <span style={{ color: '#DC2626' }}>*</span></label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {materias.map(m => (
              <button key={m} onClick={() => selectMateria(m)} style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 12, border: '0.5px solid rgba(0,0,0,0.12)',
                background: form.materia === m ? '#2563EB' : 'transparent',
                color: form.materia === m ? 'white' : '#666',
                cursor: 'pointer', fontFamily: 'DM Sans,sans-serif'
              }}>{m}</button>
            ))}
          </div>
        </div>

        {/* Tópico */}
        <div>
          <label>Tópico</label>
          <select value={form.topico_id} onChange={e => selectTopico(e.target.value)}>
            <option value="">Selecione o tópico (opcional)</option>
            {topicosFiltrados.map(t => (
              <option key={t.id} value={t.id}>{t.topico}</option>
            ))}
          </select>
        </div>

        {/* Nome da lista */}
        <div>
          <label>Nome da lista <span style={{ color: '#DC2626' }}>*</span></label>
          <input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Lista 1 - Cinemática, Apostila X..." />
        </div>

        {/* Acertos e total */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label>Acertos <span style={{ color: '#DC2626' }}>*</span></label>
            <input type="number" min="0" value={form.acertos} onChange={e => setForm({ ...form, acertos: e.target.value })} placeholder="Ex: 7" />
          </div>
          <div>
            <label>Total de questões <span style={{ color: '#DC2626' }}>*</span></label>
            <input type="number" min="1" value={form.total} onChange={e => setForm({ ...form, total: e.target.value })} placeholder="Ex: 10" />
          </div>
        </div>

        {/* Preview da porcentagem */}
        {form.acertos && form.total && Number(form.total) > 0 && (
          <div style={{ textAlign: 'center', padding: '12px', background: '#EFF6FF', borderRadius: 12 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#2563EB' }}>
              {Math.round((Number(form.acertos) / Number(form.total)) * 100)}%
            </div>
            <div style={{ fontSize: 12, color: '#2563EB' }}>{form.acertos} de {form.total} acertos</div>
          </div>
        )}

        {/* Data */}
        <div>
          <label>Data da lista</label>
          <input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} />
        </div>

        {erro && <div style={{ color: '#DC2626', fontSize: 13, background: '#FFF0F0', padding: 10, borderRadius: 8 }}>{erro}</div>}

        <button className="btn-primary" onClick={salvar} disabled={saving} style={{ marginTop: 4 }}>
          {saving ? 'Salvando...' : 'Salvar lista'}
        </button>
        <button className="btn-secondary" onClick={() => router.back()}>Cancelar</button>
      </div>
      <Nav />
    </div>
  )
}
