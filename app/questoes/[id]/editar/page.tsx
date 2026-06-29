'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { dbQuery, dbUpdate } from '@/lib/supabase'
import { DIFFICULTIES, SOURCES } from '@/lib/questoes'
import type { Alternative, ArvoreMateria, ArvoreTopico, ArvoreSubtopico, Question } from '@/lib/questoes'
import RichTextArea from '@/components/RichTextArea'
import Nav from '@/components/Nav'
import { ArrowLeft } from 'lucide-react'

const LETTERS = ['A', 'B', 'C', 'D', 'E']
const EMPTY_ALTS: Alternative[] = LETTERS.map(l => ({ letter: l, text: '' }))

export default function EditarQuestaoPage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  // Árvore
  const [materias,   setMaterias]   = useState<ArvoreMateria[]>([])
  const [topicos,    setTopicos]    = useState<ArvoreTopico[]>([])
  const [subtopicos, setSubtopicos] = useState<ArvoreSubtopico[]>([])

  // Seleção
  const [materiaId,    setMateriaId]   = useState('')
  const [topicoId,     setTopicoId]    = useState('')
  const [subtopico_id, setSubtopicoId] = useState('')

  // Campos
  const [statement, setStatement]   = useState('')
  const [solution, setSolution]     = useState('')
  const [source, setSource]         = useState('')
  const [year, setYear]             = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [vertical, setVertical]     = useState<'ITA' | 'Medicina' | ''>('')
  const [type, setType]             = useState<'multiple_choice' | 'discursive'>('multiple_choice')
  const [alternatives, setAlternatives] = useState<Alternative[]>(EMPTY_ALTS)
  const [answer, setAnswer]         = useState('')
  const [tags, setTags]             = useState('')

  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  // Guard de acesso (mesma regra da tela "Nova")
  useEffect(() => {
    if (!loading && !perfil) { router.replace('/login'); return }
    if (!loading && perfil && perfil.papel !== 'coordenador' && perfil.papel !== 'professor') {
      router.replace(`/questoes/${id}`)
    }
  }, [loading, perfil, router, id])

  async function loadTopicos(matId: string) {
    if (!matId) { setTopicos([]); return [] as ArvoreTopico[] }
    const { data } = await dbQuery<ArvoreTopico>('arvore_topicos', { materia_id: `eq.${matId}`, order: 'ordem.asc' })
    setTopicos(data || [])
    return data || []
  }

  async function loadSubtopicos(topId: string) {
    if (!topId) { setSubtopicos([]); return [] as ArvoreSubtopico[] }
    const { data } = await dbQuery<ArvoreSubtopico>('arvore_subtopicos', { topico_id: `eq.${topId}`, order: 'ordem.asc' })
    setSubtopicos(data || [])
    return data || []
  }

  // Carrega a questão + árvore e pré-preenche tudo (imperativo, sem effects em cascata)
  useEffect(() => {
    if (!perfil || !id || loaded) return
    let cancelled = false
    ;(async () => {
      const [{ data: qs }, { data: mats }] = await Promise.all([
        dbQuery<Question>('questions', { id: `eq.${id}` }),
        dbQuery<ArvoreMateria>('arvore_materias', { order: 'ordem.asc' }),
      ])
      if (cancelled) return
      const q = qs?.[0]
      setMaterias(mats || [])
      if (!q) { setLoaded(true); return }

      // Campos simples
      setStatement(q.statement || '')
      setSolution(q.solution || '')
      setSource(q.source || '')
      setYear(q.year != null ? String(q.year) : '')
      setDifficulty(q.difficulty || '')
      setVertical((q.vertical as 'ITA' | 'Medicina') || '')
      setType(q.type)
      setAnswer(q.answer || '')
      setTags((q.tags || []).join(', '))
      if (q.type === 'multiple_choice' && q.alternatives) {
        setAlternatives(LETTERS.map(l => ({
          letter: l,
          text: q.alternatives!.find(a => a.letter === l)?.text || '',
        })))
      }

      // Árvore: casa por nome (matéria → tópico → subtópico)
      const mat = (mats || []).find(m => m.nome === q.subject)
      if (mat) {
        setMateriaId(mat.id)
        const tops = await loadTopicos(mat.id)
        if (cancelled) return
        const top = tops.find(t => t.nome === q.topic)
        if (top) {
          setTopicoId(top.id)
          const subs = await loadSubtopicos(top.id)
          if (cancelled) return
          const sub = subs.find(s => s.id === q.subtopico_id || s.nome === q.subtopic)
          if (sub) setSubtopicoId(sub.id)
        }
      }
      setLoaded(true)
    })()
    return () => { cancelled = true }
  }, [perfil, id, loaded])

  function updateAlt(idx: number, text: string) {
    setAlternatives(prev => prev.map((a, i) => i === idx ? { ...a, text } : a))
  }

  async function onMateriaChange(v: string) {
    setMateriaId(v)
    setTopicoId(''); setSubtopicoId(''); setSubtopicos([])
    await loadTopicos(v)
  }

  async function onTopicoChange(v: string) {
    setTopicoId(v)
    setSubtopicoId('')
    await loadSubtopicos(v)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!materiaId)        { setError('Selecione uma matéria.'); return }
    if (!statement.trim()) { setError('O enunciado não pode estar vazio.'); return }
    if (!perfil) return

    setSaving(true)
    setError('')

    const materia   = materias.find(m => m.id === materiaId)
    const topico    = topicos.find(t => t.id === topicoId)
    const subtopico = subtopicos.find(s => s.id === subtopico_id)

    const body: Record<string, any> = {
      statement:    statement.trim(),
      subject:      materia?.nome   ?? '',
      topic:        topico?.nome    ?? null,
      subtopic:     subtopico?.nome ?? null,
      subtopico_id: subtopico_id    || null,
      source:       source          || null,
      year:         year ? parseInt(year) : null,
      difficulty:   difficulty      || null,
      vertical:     vertical        || null,
      type,
      solution:     solution.trim() || null,
      tags:         tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : null,
    }

    if (type === 'multiple_choice') {
      body.alternatives = alternatives.filter(a => a.text.trim())
      body.answer       = answer || null
    } else {
      body.alternatives = null
      body.answer       = null
    }

    const { error: err } = await dbUpdate('questions', { id: `eq.${id}` }, body)
    if (err) {
      setError(err)
      setSaving(false)
    } else {
      router.push(`/questoes/${id}`)
    }
  }

  if (loading || !perfil) return null

  if (!loaded) {
    return (
      <div style={{ padding: '40px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
        Carregando…
      </div>
    )
  }

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }
  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', background: 'white' }
  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' }
  const disabledStyle: React.CSSProperties = { ...selectStyle, background: '#f8fafc', color: '#94a3b8', cursor: 'not-allowed' }

  return (
    <div style={{ padding: '0 0 80px' }}>
      <div style={{ position: 'sticky', top: 0, background: '#F7F6F3', zIndex: 10, padding: '16px 16px 14px', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href={`/questoes/${id}`} style={{ color: '#64748b', display: 'flex' }}>
            <ArrowLeft size={20} strokeWidth={2} />
          </Link>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px' }}>Editar questão</div>
        </div>
      </div>

      <form onSubmit={handleSave}>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Identificação */}
          <div style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
              Identificação
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Matéria *</label>
                  <select value={materiaId} onChange={e => onMateriaChange(e.target.value)} required style={selectStyle}>
                    <option value="">Selecionar…</option>
                    {materias.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>
                    Tópico
                    {topicos.length > 0 && <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 4 }}>({topicos.length})</span>}
                  </label>
                  <select
                    value={topicoId}
                    onChange={e => onTopicoChange(e.target.value)}
                    disabled={!materiaId || topicos.length === 0}
                    style={!materiaId || topicos.length === 0 ? disabledStyle : selectStyle}
                  >
                    <option value="">Selecionar…</option>
                    {topicos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>
                    Subtópico
                    {subtopicos.length > 0 && <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 4 }}>({subtopicos.length})</span>}
                  </label>
                  <select
                    value={subtopico_id}
                    onChange={e => setSubtopicoId(e.target.value)}
                    disabled={!topicoId || subtopicos.length === 0}
                    style={!topicoId || subtopicos.length === 0 ? disabledStyle : selectStyle}
                  >
                    <option value="">Selecionar…</option>
                    {subtopicos.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                  </select>
                </div>
              </div>

              {materiaId && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b', background: '#f8fafc', borderRadius: 8, padding: '8px 12px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, color: '#f97316' }}>{materias.find(m => m.id === materiaId)?.nome}</span>
                  {topicoId && <>
                    <span style={{ color: '#cbd5e1' }}>›</span>
                    <span style={{ fontWeight: 600, color: '#0f2554' }}>{topicos.find(t => t.id === topicoId)?.nome}</span>
                  </>}
                  {subtopico_id && <>
                    <span style={{ color: '#cbd5e1' }}>›</span>
                    <span>{subtopicos.find(s => s.id === subtopico_id)?.nome}</span>
                  </>}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Concurso</label>
                  <select value={source} onChange={e => setSource(e.target.value)} style={selectStyle}>
                    <option value="">Selecionar…</option>
                    {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Ano</label>
                  <input type="number" placeholder="Ex: 2024" min={1960} max={2099} value={year} onChange={e => setYear(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Dificuldade</label>
                  <select value={difficulty} onChange={e => setDifficulty(e.target.value)} style={selectStyle}>
                    <option value="">Selecionar…</option>
                    {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Tipo</label>
                  <select value={type} onChange={e => setType(e.target.value as any)} style={selectStyle}>
                    <option value="multiple_choice">Múltipla escolha</option>
                    <option value="discursive">Discursiva</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Vertical</label>
                  <select value={vertical} onChange={e => setVertical(e.target.value as any)} style={selectStyle}>
                    <option value="">Ambas</option>
                    <option value="ITA">ITA</option>
                    <option value="Medicina">Medicina</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Tags (vírgula)</label>
                  <input value={tags} onChange={e => setTags(e.target.value)} placeholder="vetores, MRU, lei de newton" style={inputStyle} />
                </div>
              </div>
            </div>
          </div>

          {/* Enunciado */}
          <div style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
            <RichTextArea
              label="Enunciado"
              value={statement}
              onChange={setStatement}
              placeholder="Digite o enunciado. Use $...$ para LaTeX inline e $$...$$ para equações em bloco."
              rows={6}
            />
          </div>

          {/* Alternativas */}
          {type === 'multiple_choice' && (
            <div style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Alternativas</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {alternatives.map((alt, i) => (
                  <div key={alt.letter} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div
                      onClick={() => setAnswer(alt.letter)}
                      title="Marcar como gabarito"
                      style={{
                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: answer === alt.letter ? '#16a34a' : 'white',
                        color:      answer === alt.letter ? 'white'  : '#94a3b8',
                        fontWeight: 700, fontSize: 12, marginTop: 4, cursor: 'pointer',
                        border: `1.5px solid ${answer === alt.letter ? '#16a34a' : '#cbd5e1'}`,
                        transition: 'all 0.15s',
                      }}
                    >
                      {alt.letter}
                    </div>
                    <div style={{ flex: 1 }}>
                      <RichTextArea compact value={alt.text} onChange={v => updateAlt(i, v)} placeholder={`Alternativa ${alt.letter}…`} />
                    </div>
                  </div>
                ))}
              </div>
              {answer && (
                <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: '#dcfce7', color: '#15803d', fontSize: 12, fontWeight: 500 }}>
                  Gabarito: alternativa {answer}
                </div>
              )}
            </div>
          )}

          {/* Resolução */}
          <div style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
            <RichTextArea
              label="Resolução"
              optional
              value={solution}
              onChange={setSolution}
              placeholder="Resolução passo a passo. Suporta LaTeX."
              rows={6}
            />
          </div>

          {error && (
            <div style={{ background: '#fee2e2', color: '#dc2626', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="submit"
              disabled={saving}
              style={{ padding: '12px 28px', background: '#f97316', color: 'white', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}
            >
              {saving ? 'Salvando…' : 'Salvar alterações'}
            </button>
            <Link
              href={`/questoes/${id}`}
              style={{ padding: '12px 28px', background: 'white', color: '#64748b', border: '1.5px solid #e2e8f0', borderRadius: 12, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}
            >
              Cancelar
            </Link>
          </div>
        </div>
      </form>
      <Nav />
    </div>
  )
}
