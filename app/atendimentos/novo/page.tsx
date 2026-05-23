'use client'
import { useEffect, useState } from 'react'
import { supabase, dbQuery, dbInsert } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'

export default function NovoAtendimento() {
  const { perfil } = useAuth()
  const router = useRouter()
  const [alunos, setAlunos] = useState<any[]>([])
  const [mentores, setMentores] = useState<string[]>([])
  const [form, setForm] = useState({
    mentor: perfil?.mentor_nome || '',
    tipo: 'Individual',
    aluno: '',
    data_atendimento: new Date().toISOString().split('T')[0],
    hora_inicio: '',
    hora_fim: '',
    encaminhamento_psico: false,
    solicitacao_aluno: '',
    descricao: '',
    link_gravacao: '',
    link_gemini: '',
  })
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    Promise.all([
      dbQuery('alunos_dados', { order: 'nome' }, 'nome,mentor'),
      dbQuery('atendimentos_mentoria', { limit: '100' }, 'mentor'),
    ]).then(([{ data: als }, { data: ats }]) => {
      setAlunos(als || [])
      const ms = [...new Set((ats || []).map(a => a.mentor))].sort() as string[]
      setMentores(ms)
    })
    if (perfil?.mentor_nome) setForm(f => ({ ...f, mentor: perfil.mentor_nome || '' }))
  }, [perfil])

  const alunosFiltrados = form.mentor
    ? alunos.filter(a => a.mentor === form.mentor)
    : alunos

  function calcDuracao(): number {
    if (!form.hora_inicio || !form.hora_fim) return 0
    const [hi, mi] = form.hora_inicio.split(':').map(Number)
    const [hf, mf] = form.hora_fim.split(':').map(Number)
    return (hf * 60 + mf) - (hi * 60 + mi)
  }

  const durMin = calcDuracao()
  const valor = Math.round((durMin / 60) * 200 * 100) / 100

  async function salvar() {
    if (!form.mentor || !form.data_atendimento) { setErro('Preencha mentor e data.'); return }
    setSaving(true); setErro('')

    let arquivoUrl = null, arquivoNome = null
    if (arquivo) {
      const path = `gemini/${form.mentor}/${Date.now()}_${arquivo.name}`
      const { error: upErr } = await supabase.storage.from('atendimentos').upload(path, arquivo, { upsert: true })
      if (!upErr) {
        const { data } = supabase.storage.from('atendimentos').getPublicUrl(path)
        arquivoUrl = data.publicUrl
        arquivoNome = arquivo.name
      }
    }

    const mes = new Date(form.data_atendimento).toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' })
    const ano = new Date(form.data_atendimento).getFullYear()

    const { error } = await dbInsert('atendimentos_mentoria', [{
      ...form,
      duracao_minutos: durMin,
      valor_pago: valor,
      arquivo_gemini_url: arquivoUrl,
      arquivo_gemini_nome: arquivoNome,
      mes, ano,
    }])

    if (error) { setErro(error); setSaving(false) }
    else router.push('/atendimentos')
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>←</button>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Novo atendimento</div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Mentor */}
        {perfil?.papel === 'coordenador' ? (
          <div>
            <label>Mentor</label>
            <select value={form.mentor} onChange={e => setForm({ ...form, mentor: e.target.value, aluno: '' })}>
              <option value="">Selecione</option>
              {mentores.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        ) : (
          <div className="card" style={{ background: '#EFF6FF', padding: '10px 14px' }}>
            <div style={{ fontSize: 12, color: '#999' }}>Mentor</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#2563EB' }}>{form.mentor}</div>
          </div>
        )}

        {/* Tipo */}
        <div>
          <label>Tipo</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            {['Individual', 'Coletiva'].map(t => (
              <button key={t} onClick={() => setForm({ ...form, tipo: t })} style={{
                flex: 1, padding: '9px', borderRadius: 10,
                border: `1.5px solid ${form.tipo === t ? '#2563EB' : 'rgba(0,0,0,0.1)'}`,
                background: form.tipo === t ? '#EFF6FF' : 'transparent',
                color: form.tipo === t ? '#2563EB' : '#666',
                cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 500
              }}>{t}</button>
            ))}
          </div>
        </div>

        {/* Aluno */}
        {form.tipo === 'Individual' && (
          <div>
            <label>Aluno</label>
            <select value={form.aluno} onChange={e => setForm({ ...form, aluno: e.target.value })}>
              <option value="">Selecione o aluno</option>
              {alunosFiltrados.map(a => <option key={a.nome} value={a.nome}>{a.nome}</option>)}
            </select>
          </div>
        )}

        {/* Data e horários */}
        <div><label>Data do atendimento</label><input type="date" value={form.data_atendimento} onChange={e => setForm({ ...form, data_atendimento: e.target.value })} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label>Início</label><input type="time" value={form.hora_inicio} onChange={e => setForm({ ...form, hora_inicio: e.target.value })} /></div>
          <div><label>Fim</label><input type="time" value={form.hora_fim} onChange={e => setForm({ ...form, hora_fim: e.target.value })} /></div>
        </div>

        {/* Preview duração/valor */}
        {durMin > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ background: '#F7F6F3', borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#2563EB' }}>{durMin}min</div>
              <div style={{ fontSize: 10, color: '#999' }}>duração</div>
            </div>
            <div style={{ background: '#DCFCE7', borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#16A34A' }}>R$ {valor.toFixed(2)}</div>
              <div style={{ fontSize: 10, color: '#16A34A' }}>valor</div>
            </div>
          </div>
        )}

        {/* Encaminhamento psico */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: form.encaminhamento_psico ? '#FEF2F2' : '#F7F6F3', borderRadius: 12, padding: '12px 16px', cursor: 'pointer' }}
          onClick={() => setForm({ ...form, encaminhamento_psico: !form.encaminhamento_psico })}>
          <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${form.encaminhamento_psico ? '#DC2626' : 'rgba(0,0,0,0.15)'}`, background: form.encaminhamento_psico ? '#DC2626' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {form.encaminhamento_psico && <span style={{ color: 'white', fontSize: 14 }}>✓</span>}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: form.encaminhamento_psico ? '#DC2626' : '#1a1a1a' }}>Encaminhamento psicológico</div>
            <div style={{ fontSize: 11, color: '#999' }}>Marque se o aluno precisa de apoio psicológico</div>
          </div>
        </div>

        {/* Solicitação do aluno */}
        <div><label>Solicitação do aluno</label><input value={form.solicitacao_aluno} onChange={e => setForm({ ...form, solicitacao_aluno: e.target.value })} placeholder="O que o aluno solicitou?" /></div>

        {/* Descrição */}
        <div>
          <label>Descrição do atendimento</label>
          <textarea value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} placeholder="Descreva o atendimento com suas próprias palavras..." rows={4} style={{ resize: 'vertical' }} />
        </div>

        {/* Links */}
        <div><label>Link da gravação (Google Meet)</label><input value={form.link_gravacao} onChange={e => setForm({ ...form, link_gravacao: e.target.value })} placeholder="https://drive.google.com/..." /></div>
        <div><label>Link do relatório Gemini</label><input value={form.link_gemini} onChange={e => setForm({ ...form, link_gemini: e.target.value })} placeholder="https://docs.google.com/..." /></div>

        {/* Upload .docx */}
        <div>
          <label>Upload do relatório Gemini (.docx)</label>
          <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>Use o upload para habilitar o resumo por IA</div>
          <input type="file" accept=".docx,.doc" onChange={e => setArquivo(e.target.files?.[0] || null)}
            style={{ width: '100%', padding: '10px', borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.12)', background: '#F7F6F3', fontSize: 13 }} />
          {arquivo && <div style={{ fontSize: 11, color: '#16A34A', marginTop: 6 }}>✅ {arquivo.name}</div>}
        </div>

        {erro && <div style={{ color: '#DC2626', fontSize: 13, background: '#FFF0F0', padding: 10, borderRadius: 8 }}>{erro}</div>}

        <button className="btn-primary" onClick={salvar} disabled={saving} style={{ marginTop: 4 }}>
          {saving ? 'Salvando...' : 'Registrar atendimento'}
        </button>
        <button className="btn-secondary" onClick={() => router.back()}>Cancelar</button>
      </div>
      <Nav />
    </div>
  )
}
