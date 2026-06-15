'use client'
import { useEffect, useState } from 'react'
import { dbQuery, dbInsert, supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'

const EXAM_CONFIG: Record<string, Record<number, { questoes: number; modelo: string }>> = {
  ime: { 1: { questoes: 40, modelo: 'multipla_escolha' }, 2: { questoes: 10, modelo: 'discursiva' } },
  ita: { 1: { questoes: 48, modelo: 'multipla_escolha' }, 2: { questoes: 10, modelo: 'discursiva' } },
}

type QuestaoForm = { materia: string; topicos: string[] }

export default function NovaProvaAntiga() {
  const { perfil } = useAuth()
  const router = useRouter()

  const [step, setStep] = useState(1)
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState('')
  const [fase, setFase] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfResolucaoFile, setPdfResolucaoFile] = useState<File | null>(null)

  const [questoes, setQuestoes] = useState<QuestaoForm[]>([])
  const [topicosDB, setTopicosDB] = useState<any[]>([])
  const [materias, setMaterias] = useState<string[]>([])

  const [saving, setSaving] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [erro, setErro] = useState('')
  const [searchOpen, setSearchOpen] = useState<number | null>(null)
  const [searchText, setSearchText] = useState('')

  const config = tipo && fase ? EXAM_CONFIG[tipo]?.[Number(fase)] : null
  const numQuestoes = config?.questoes || 0
  const modelo = config?.modelo || ''

  useEffect(() => {
    dbQuery('topicos', {}, 'id,materia,topico').then(({ data }) => {
      const t = data || []
      setTopicosDB(t)
      setMaterias([...new Set(t.map((x: any) => x.materia))].sort() as string[])
    })
  }, [])

  useEffect(() => {
    if (numQuestoes > 0) {
      setQuestoes(Array.from({ length: numQuestoes }, () => ({ materia: '', topicos: [] })))
    }
  }, [numQuestoes])

  function setQuestaoMateria(idx: number, materia: string) {
    setQuestoes(prev => prev.map((q, i) => i === idx ? { materia, topicos: [] } : q))
  }

  function toggleQuestaoTopico(idx: number, topicoId: string) {
    setQuestoes(prev => prev.map((q, i) => {
      if (i !== idx) return q
      const already = q.topicos.includes(topicoId)
      return { ...q, topicos: already ? q.topicos.filter(t => t !== topicoId) : [...q.topicos, topicoId] }
    }))
  }

  function getTopicosDaMateria(materia: string) {
    return topicosDB.filter((t: any) => t.materia === materia)
  }

  function irParaPasso2() {
    if (!nome.trim()) { setErro('Informe o nome da prova.'); return }
    if (!tipo) { setErro('Selecione o tipo (IME ou ITA).'); return }
    if (!fase) { setErro('Selecione a fase.'); return }
    setErro('')
    setStep(2)
  }

  async function salvar() {
    const incompletas = questoes.filter(q => !q.materia).length
    if (incompletas > 0) {
      setErro(`${incompletas} questão(ões) sem matéria. Preencha todas antes de salvar.`)
      return
    }
    setSaving(true)
    setErro('')

    let pdf_url = ''
    let pdf_resolucao_url = ''

    if (pdfFile) {
      setUploadProgress('Enviando PDF da prova...')
      const path = `${tipo}-fase${fase}/${Date.now()}-${pdfFile.name}`
      const { error: upErr } = await supabase.storage.from('provas-antigas').upload(path, pdfFile, { upsert: true })
      if (upErr) { setErro('Erro ao enviar PDF: ' + upErr.message); setSaving(false); return }
      const { data: urlData } = supabase.storage.from('provas-antigas').getPublicUrl(path)
      pdf_url = urlData.publicUrl
    }

    if (pdfResolucaoFile) {
      setUploadProgress('Enviando PDF da resolução...')
      const path = `${tipo}-fase${fase}/resolucao-${Date.now()}-${pdfResolucaoFile.name}`
      const { error: upErr } = await supabase.storage.from('provas-antigas').upload(path, pdfResolucaoFile, { upsert: true })
      if (upErr) { setErro('Erro ao enviar resolução: ' + upErr.message); setSaving(false); return }
      const { data: urlData } = supabase.storage.from('provas-antigas').getPublicUrl(path)
      pdf_resolucao_url = urlData.publicUrl
    }

    setUploadProgress('Cadastrando prova...')
    const { data: provaArr, error: provaErr } = await dbInsert<any>('provas_antigas', [{
      nome: nome.trim(),
      tipo,
      fase: Number(fase),
      num_questoes: numQuestoes,
      modelo,
      pdf_url: pdf_url || null,
      pdf_resolucao_url: pdf_resolucao_url || null,
    }], true)

    if (provaErr || !provaArr?.[0]) {
      setErro('Erro ao cadastrar prova: ' + (provaErr || 'sem retorno'))
      setSaving(false)
      return
    }

    const provaId = provaArr[0].id

    setUploadProgress('Salvando questões...')
    const records = questoes.map((q, i) => ({
      prova_id: provaId,
      numero: i + 1,
      materia: q.materia,
      topicos: q.topicos,
    }))

    const { error: qErr } = await dbInsert('questoes_prova_antiga', records)
    if (qErr) { setErro('Erro ao salvar questões: ' + qErr); setSaving(false); return }

    router.push('/provas-antigas')
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => step === 1 ? router.back() : setStep(1)}
          style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}
        >←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 600 }}>Nova prova antiga</div>
          <div style={{ fontSize: 11, color: '#999' }}>Passo {step} de 2</div>
        </div>
        {/* Progress bar */}
        <div style={{ width: 60, height: 4, background: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: step === 1 ? '50%' : '100%', height: '100%', background: '#f97316', borderRadius: 4, transition: 'width 0.3s' }} />
        </div>
      </div>

      {/* ── Passo 1: Info básica ── */}
      {step === 1 && (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label>Nome da prova</label>
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: ITA 2024 — 1ª Fase" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label>Tipo</label>
              <select value={tipo} onChange={e => { setTipo(e.target.value); setFase('') }}>
                <option value="">Selecione</option>
                <option value="ime">IME</option>
                <option value="ita">ITA</option>
              </select>
            </div>
            <div>
              <label>Fase</label>
              <select value={fase} onChange={e => setFase(e.target.value)} disabled={!tipo}>
                <option value="">Selecione</option>
                <option value="1">1ª Fase</option>
                <option value="2">2ª Fase</option>
              </select>
            </div>
          </div>

          {config && (
            <div style={{ background: '#F3F0FF', borderRadius: 10, padding: 12, fontSize: 13, color: '#5B21B6' }}>
              ✅ {EXAM_CONFIG[tipo][Number(fase)].questoes} questões · {config.modelo === 'multipla_escolha' ? 'Múltipla escolha' : 'Discursiva'}
            </div>
          )}

          <div>
            <label>PDF da prova (opcional)</label>
            <input
              type="file"
              accept="application/pdf"
              onChange={e => setPdfFile(e.target.files?.[0] || null)}
              style={{ padding: '8px 0' }}
            />
            {pdfFile && <div style={{ fontSize: 11, color: '#16A34A', marginTop: 4 }}>✓ {pdfFile.name}</div>}
          </div>

          <div>
            <label>PDF de resolução (opcional)</label>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
              Liberado para o aluno apenas após ele corrigir a prova.
            </div>
            <input
              type="file"
              accept="application/pdf"
              onChange={e => setPdfResolucaoFile(e.target.files?.[0] || null)}
              style={{ padding: '8px 0' }}
            />
            {pdfResolucaoFile && <div style={{ fontSize: 11, color: '#16A34A', marginTop: 4 }}>✓ {pdfResolucaoFile.name}</div>}
          </div>

          {erro && <div style={{ color: '#DC2626', fontSize: 13 }}>{erro}</div>}

          <button className="btn-primary" onClick={irParaPasso2} disabled={!config}>
            Próximo: configurar questões →
          </button>
          <button className="btn-secondary" onClick={() => router.back()}>Cancelar</button>
        </div>
      )}

      {/* ── Passo 2: Questões ── */}
      {step === 2 && (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ marginBottom: 12, fontSize: 13, color: '#666' }}>
            Configure a matéria e os tópicos de cada uma das {numQuestoes} questões.
          </div>

          {questoes.map((q, idx) => {
            const topicosDaMateria = getTopicosDaMateria(q.materia)
            const isSearchOpen = searchOpen === idx
            const topicosJaSelecionados = q.topicos.map(id => topicosDB.find((t: any) => t.id === id)).filter(Boolean)
            const topicosDisponiveis = topicosDaMateria
              .filter((t: any) => !q.topicos.includes(t.id))
              .filter((t: any) => !searchText || t.topico.toLowerCase().includes(searchText.toLowerCase()))

            return (
              <div
                key={idx}
                style={{
                  border: '0.5px solid rgba(0,0,0,0.1)',
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 8,
                  background: q.materia ? 'white' : '#FFFBEB',
                }}
              >
                {/* Número + select de matéria */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: 6, background: '#EDE9FE',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, color: '#5B21B6', flexShrink: 0
                  }}>
                    {idx + 1}
                  </div>
                  <select
                    value={q.materia}
                    onChange={e => { setQuestaoMateria(idx, e.target.value); setSearchOpen(null) }}
                    style={{ flex: 1, margin: 0, padding: '6px 8px', fontSize: 13 }}
                  >
                    <option value="">— Selecione a matéria —</option>
                    {materias.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>

                {/* Tópicos selecionados como chips + botão + */}
                {q.materia && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8, paddingLeft: 36 }}>
                    {topicosJaSelecionados.map((t: any) => (
                      <span key={t.id} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '3px 8px 3px 10px', borderRadius: 20, fontSize: 11,
                        background: '#fff7ed', color: '#f97316',
                        border: '1px solid rgba(249,115,22,0.3)',
                      }}>
                        {t.topico}
                        <button
                          onClick={() => toggleQuestaoTopico(idx, t.id)}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: '#f97316', fontSize: 13, padding: 0, lineHeight: 1,
                            display: 'flex', alignItems: 'center',
                          }}
                        >×</button>
                      </span>
                    ))}

                    {/* Botão + */}
                    {topicosDaMateria.length > 0 && !isSearchOpen && (
                      <button
                        onClick={() => { setSearchOpen(idx); setSearchText('') }}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          padding: '3px 10px', borderRadius: 20, fontSize: 11,
                          border: '1px dashed rgba(0,0,0,0.2)', background: 'transparent',
                          color: '#999', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                        }}
                      >+ tópico</button>
                    )}
                  </div>
                )}

                {/* Campo de busca de tópico */}
                {isSearchOpen && (
                  <div style={{ marginTop: 8, paddingLeft: 36, position: 'relative' }}>
                    <input
                      autoFocus
                      value={searchText}
                      onChange={e => setSearchText(e.target.value)}
                      onKeyDown={e => e.key === 'Escape' && setSearchOpen(null)}
                      placeholder="Buscar tópico..."
                      style={{ margin: 0, fontSize: 12, padding: '6px 10px' }}
                    />
                    {topicosDisponiveis.length > 0 && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0,
                        background: 'white', border: '0.5px solid rgba(0,0,0,0.12)',
                        borderRadius: 10, marginTop: 4, maxHeight: 180, overflowY: 'auto',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 20,
                      }}>
                        {topicosDisponiveis.map((t: any) => (
                          <div
                            key={t.id}
                            onClick={() => { toggleQuestaoTopico(idx, t.id); setSearchText('') }}
                            style={{
                              padding: '8px 12px', fontSize: 12, cursor: 'pointer',
                              borderBottom: '0.5px solid rgba(0,0,0,0.06)',
                              color: '#1a1a1a',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = '#fff7ed'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            {t.topico}
                          </div>
                        ))}
                      </div>
                    )}
                    {topicosDisponiveis.length === 0 && searchText && (
                      <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>Nenhum tópico encontrado.</div>
                    )}
                    <button
                      onClick={() => setSearchOpen(null)}
                      style={{
                        marginTop: 4, fontSize: 11, color: '#999', background: 'none',
                        border: 'none', cursor: 'pointer', padding: 0,
                      }}
                    >Fechar</button>
                  </div>
                )}
              </div>
            )
          })}

          {erro && <div style={{ color: '#DC2626', fontSize: 13, marginTop: 8 }}>{erro}</div>}
          {uploadProgress && <div style={{ color: '#f97316', fontSize: 13, marginTop: 8 }}>{uploadProgress}</div>}

          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button className="btn-primary" onClick={salvar} disabled={saving} style={{ background: '#f97316' }}>
              {saving ? uploadProgress || 'Salvando...' : 'Cadastrar prova'}
            </button>
            <button className="btn-secondary" onClick={() => setStep(1)}>← Voltar</button>
          </div>
        </div>
      )}

      <Nav />
    </div>
  )
}
