'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { dbQuery, dbInsert, dbUpdate } from '@/lib/supabase'
import { Plus, Search, BookOpen, CheckCircle, Eye, EyeOff, RotateCcw, ArrowLeft, ArrowRight } from 'lucide-react'
import { DIFFICULTIES, SOURCES, difficultyColor, difficultyBg } from '@/lib/questoes'
import type { Question, QuestaoProgresso, ProgressStatus, ArvoreMateria, ArvoreTopico, ArvoreSubtopico } from '@/lib/questoes'
import LatexRenderer from '@/components/LatexRenderer'
import Nav from '@/components/Nav'

function QuestoesContent() {
  const { perfil, loading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [materiaId,    setMateriaId]    = useState('')
  const [topicoId,     setTopicoId]     = useState('')
  const [subtopico_id, setSubtopicoId]  = useState('')
  const [difficulty,   setDifficulty]   = useState('')
  const [source,       setSource]       = useState('')
  const [type,         setType]         = useState('')

  const [materias,   setMaterias]   = useState<ArvoreMateria[]>([])
  const [topicos,    setTopicos]    = useState<ArvoreTopico[]>([])
  const [subtopicos, setSubtopicos] = useState<ArvoreSubtopico[]>([])

  const [questions, setQuestions]   = useState<Question[]>([])
  const [fetching, setFetching]     = useState(false)
  const [notFound, setNotFound]     = useState(false)
  const [sessionStarted, setSessionStarted] = useState(false)
  const [sessionDone, setSessionDone]       = useState(false)
  const [sessionAnswers, setSessionAnswers] = useState<Record<string, boolean>>({})
  const [currentIndex, setCurrentIndex]     = useState(0)

  const [selectedAlt, setSelectedAlt] = useState<string | null>(null)
  const [confirmed, setConfirmed]     = useState(false)
  const [showSolution, setShowSolution] = useState(false)
  const [progresses, setProgresses]   = useState<Record<string, QuestaoProgresso>>({})
  const [updatingStatus, setUpdatingStatus] = useState(false)

  useEffect(() => {
    if (!loading && !perfil) router.replace('/login')
  }, [loading, perfil, router])

  const podeEditar = perfil?.papel === 'coordenador' || perfil?.papel === 'professor'

  useEffect(() => {
    dbQuery<ArvoreMateria>('arvore_materias', { order: 'ordem.asc' }).then(({ data }) => setMaterias(data || []))
  }, [])

  useEffect(() => {
    if (!materiaId) { setTopicos([]); setTopicoId(''); setSubtopicos([]); setSubtopicoId(''); return }
    dbQuery<ArvoreTopico>('arvore_topicos', { materia_id: `eq.${materiaId}`, order: 'ordem.asc' }).then(({ data }) => {
      setTopicos(data || []); setTopicoId(''); setSubtopicos([]); setSubtopicoId('')
    })
  }, [materiaId])

  useEffect(() => {
    if (!topicoId) { setSubtopicos([]); setSubtopicoId(''); return }
    dbQuery<ArvoreSubtopico>('arvore_subtopicos', { topico_id: `eq.${topicoId}`, order: 'ordem.asc' }).then(({ data }) => {
      setSubtopicos(data || []); setSubtopicoId('')
    })
  }, [topicoId])

  async function handleBuscar() {
    if (!perfil) return
    setFetching(true)
    setNotFound(false)

    const materia = materias.find(m => m.id === materiaId)
    const params: Record<string, string> = { order: 'created_at.desc' }
    if (materiaId)    params.subject       = `eq.${materia?.nome ?? ''}`
    if (subtopico_id) params.subtopico_id  = `eq.${subtopico_id}`
    else if (topicoId) {
      // filtra todos os subtópicos do tópico selecionado
      const ids = subtopicos.map(s => s.id).join(',')
      if (ids) params.subtopico_id = `in.(${ids})`
    }
    if (difficulty) params.difficulty = `eq.${difficulty}`
    if (source)     params.source     = `eq.${source}`
    if (type)       params.type       = `eq.${type}`

    const { data: qs } = await dbQuery<Question>('questions', params)
    setFetching(false)

    if (!qs || qs.length === 0) { setNotFound(true); return }

    const ids = qs.map(q => q.id).join(',')
    const { data: prs } = await dbQuery<QuestaoProgresso>('questoes_progresso', {
      aluno_id: `eq.${perfil.id}`,
      question_id: `in.(${ids})`,
    })
    const map: Record<string, QuestaoProgresso> = {}
    ;(prs || []).forEach(p => { map[p.question_id] = p })

    setQuestions(qs)
    setProgresses(map)
    setCurrentIndex(0)
    setSelectedAlt(null)
    setConfirmed(false)
    setShowSolution(false)
    setSessionAnswers({})
    setSessionDone(false)
    setSessionStarted(true)
  }

  async function setStatus(questionId: string, status: ProgressStatus) {
    if (!perfil) return
    setUpdatingStatus(true)
    const existing = progresses[questionId]
    if (existing) {
      await dbUpdate('questoes_progresso', { id: `eq.${existing.id}` }, { status, updated_at: new Date().toISOString() })
      setProgresses(prev => ({ ...prev, [questionId]: { ...existing, status } }))
    } else {
      const { data } = await dbInsert<QuestaoProgresso>('questoes_progresso', {
        aluno_id: perfil.id,
        question_id: questionId,
        status,
      }, true)
      if (data?.[0]) setProgresses(prev => ({ ...prev, [questionId]: data[0] }))
    }
    setUpdatingStatus(false)
  }

  function goTo(index: number) {
    setCurrentIndex(index)
    setSelectedAlt(null)
    setConfirmed(false)
    setShowSolution(false)
  }

  if (loading || !perfil) return null

  // ── SESSÃO CONCLUÍDA ──────────────────────────────────────────────────────
  if (sessionDone) {
    const answeredCount = Object.keys(sessionAnswers).length
    const correct = Object.values(sessionAnswers).filter(Boolean).length
    const wrong   = answeredCount - correct
    const pct     = answeredCount > 0 ? Math.round((correct / answeredCount) * 100) : 0

    return (
      <div style={{ maxWidth: 500, margin: '60px auto', padding: '0 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>
          {pct >= 70 ? '🎉' : pct >= 40 ? '💪' : '📚'}
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.3px', marginBottom: 6 }}>
          Sessão concluída!
        </div>
        <div style={{ fontSize: 14, color: '#64748b', marginBottom: 28 }}>
          {questions.length} questão{questions.length !== 1 ? 'ões' : ''} percorrida{questions.length !== 1 ? 's' : ''}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 }}>
          {[
            { label: 'Acertos', value: correct, color: '#16a34a' },
            { label: 'Erros',   value: wrong,   color: '#dc2626' },
            { label: 'Aprov.',  value: `${pct}%`, color: pct >= 70 ? '#16a34a' : pct >= 40 ? '#d97706' : '#dc2626' },
          ].map(item => (
            <div key={item.label} style={{
              background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '16px 8px',
            }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: item.color }}>{item.value}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{item.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => { setCurrentIndex(0); setSelectedAlt(null); setConfirmed(false); setShowSolution(false); setSessionAnswers({}); setSessionDone(false) }}
            style={{ padding: '11px 22px', background: '#0f2554', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Estudar novamente
          </button>
          <button
            onClick={() => { setSessionStarted(false); setSessionDone(false) }}
            style={{ padding: '11px 20px', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', color: '#64748b' }}
          >
            Voltar aos filtros
          </button>
        </div>
      </div>
    )
  }

  // ── MODO ESTUDO ───────────────────────────────────────────────────────────
  if (sessionStarted && questions.length > 0) {
    const q = questions[currentIndex]

    return (
      <div style={{ padding: '0 0 80px' }}>
        <div style={{
          position: 'sticky', top: 0, background: '#F7F6F3', zIndex: 10,
          padding: '14px 16px 10px', borderBottom: '1px solid #e2e8f0',
        }}>
          <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button
              onClick={() => setSessionStarted(false)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 13, fontFamily: 'inherit', padding: 0 }}
            >
              <ArrowLeft size={15} /> Filtros
            </button>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>
              {currentIndex + 1} / {questions.length}
            </span>
            {podeEditar && (
              <Link href={`/questoes/${q.id}`} style={{ fontSize: 12, color: '#f97316', textDecoration: 'none' }}>
                Detalhes
              </Link>
            )}
            {!podeEditar && <span style={{ width: 60 }} />}
          </div>
          <div style={{ maxWidth: 800, margin: '10px auto 0', height: 3, background: '#e2e8f0', borderRadius: 2 }}>
            <div style={{
              height: '100%', background: '#f97316', borderRadius: 2,
              width: `${((currentIndex + 1) / questions.length) * 100}%`,
              transition: 'width 0.3s',
            }} />
          </div>
        </div>

        <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Badges */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {q.difficulty && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: difficultyBg(q.difficulty), color: difficultyColor(q.difficulty) }}>
                {q.difficulty}
              </span>
            )}
            <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: '#dbeafe', color: '#1e40af' }}>
              {q.subject}
            </span>
            {q.topic && (
              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#f1f5f9', color: '#475569' }}>
                {q.topic}
              </span>
            )}
            <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#f1f5f9', color: '#475569' }}>
              {q.type === 'multiple_choice' ? 'Objetiva' : 'Discursiva'}
            </span>
            {q.source && (
              <span style={{ fontSize: 11, color: '#94a3b8' }}>{q.source}{q.year ? ` ${q.year}` : ''}</span>
            )}
          </div>

          {/* Enunciado */}
          <div style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
              Enunciado
            </div>
            <LatexRenderer text={q.statement} />
          </div>

          {/* Alternativas */}
          {q.type === 'multiple_choice' && q.alternatives && q.alternatives.length > 0 && (
            <div style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
                Alternativas
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {q.alternatives.map(alt => {
                  const isSelected    = selectedAlt === alt.letter
                  const isCorrect     = alt.letter.toUpperCase() === (q.answer || '').trim().toUpperCase()
                  const isWrong       = confirmed && isSelected && !isCorrect
                  const isGreen       = confirmed && isCorrect
                  const isHighlighted = !confirmed && isSelected

                  let bg = 'white', border = '#e2e8f0'
                  let circleBg = 'white', circleColor = '#94a3b8', circleBorder = '#cbd5e1'

                  if (isGreen)       { bg = '#dcfce7'; border = '#16a34a'; circleBg = '#16a34a'; circleColor = 'white'; circleBorder = '#16a34a' }
                  else if (isWrong)  { bg = '#fee2e2'; border = '#dc2626'; circleBg = '#dc2626'; circleColor = 'white'; circleBorder = '#dc2626' }
                  else if (isHighlighted) { bg = '#fff7ed'; border = '#f97316'; circleBg = '#f97316'; circleColor = 'white'; circleBorder = '#f97316' }

                  return (
                    <div
                      key={alt.letter}
                      onClick={() => { if (!confirmed) setSelectedAlt(alt.letter) }}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px', borderRadius: 10, background: bg, border: `1.5px solid ${border}`, cursor: confirmed ? 'default' : 'pointer', transition: 'all 0.15s' }}
                    >
                      <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: circleBg, color: circleColor, fontWeight: 700, fontSize: 12, border: `1.5px solid ${circleBorder}`, transition: 'all 0.15s' }}>
                        {alt.letter}
                      </div>
                      <div style={{ flex: 1, paddingTop: 2 }}><LatexRenderer text={alt.text} /></div>
                      {isGreen && <CheckCircle size={16} color="#16a34a" style={{ flexShrink: 0, marginTop: 4 }} />}
                      {isWrong && <span style={{ flexShrink: 0, marginTop: 4, color: '#dc2626' }}>✕</span>}
                    </div>
                  )
                })}
              </div>

              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {selectedAlt && !confirmed && (
                  <button
                    disabled={updatingStatus}
                    onClick={async () => {
                      setConfirmed(true)
                      const isCorrect = selectedAlt.trim().toUpperCase() === (q.answer || '').trim().toUpperCase()
                      setSessionAnswers(prev => ({ ...prev, [q.id]: isCorrect }))
                      await setStatus(q.id, isCorrect ? 'solved' : 'in_review')
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f97316', color: 'white', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: updatingStatus ? 0.7 : 1 }}
                  >
                    <CheckCircle size={14} /> Confirmar
                  </button>
                )}
                {confirmed && selectedAlt && (
                  <>
                    <span style={{
                      fontSize: 13, fontWeight: 600, padding: '9px 14px', borderRadius: 8,
                      color:      selectedAlt.trim().toUpperCase() === (q.answer || '').trim().toUpperCase() ? '#15803d' : '#dc2626',
                      background: selectedAlt.trim().toUpperCase() === (q.answer || '').trim().toUpperCase() ? '#dcfce7' : '#fee2e2',
                    }}>
                      {selectedAlt.trim().toUpperCase() === (q.answer || '').trim().toUpperCase() ? '✓ Correto!' : `✕ Incorreto — resposta: ${q.answer}`}
                    </span>
                    <button
                      onClick={() => { setSelectedAlt(null); setConfirmed(false) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      <RotateCcw size={13} /> Tentar novamente
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Resolução */}
          {q.solution && (
            <div style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showSolution ? 12 : 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Resolução</div>
                <button
                  onClick={() => setShowSolution(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, background: showSolution ? '#fff7ed' : '#f8fafc', color: showSolution ? '#f97316' : '#64748b', border: 'none', borderRadius: 8, padding: '5px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  {showSolution ? <EyeOff size={13} /> : <Eye size={13} />}
                  {showSolution ? 'Ocultar' : 'Ver resolução'}
                </button>
              </div>
              {showSolution && <LatexRenderer text={q.solution} />}
            </div>
          )}

          {/* Navegação */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 }}>
            <button
              onClick={() => goTo(currentIndex - 1)}
              disabled={currentIndex === 0}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: currentIndex === 0 ? 'not-allowed' : 'pointer', opacity: currentIndex === 0 ? 0.35 : 1, fontFamily: 'inherit', color: '#1a1a1a' }}
            >
              <ArrowLeft size={15} /> Anterior
            </button>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>{currentIndex + 1} de {questions.length}</span>
            {currentIndex < questions.length - 1 ? (
              <button
                onClick={() => goTo(currentIndex + 1)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', background: '#0f2554', color: 'white', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Próxima <ArrowRight size={15} />
              </button>
            ) : (
              <button
                onClick={() => setSessionDone(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <CheckCircle size={15} /> Concluir
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── FILTROS ───────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '0 0 32px' }}>
      <div style={{
        position: 'sticky', top: 0, background: '#F7F6F3', zIndex: 10,
        padding: '20px 16px 16px', borderBottom: '1px solid #e2e8f0',
      }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px' }}>Questões</div>
            {podeEditar && (
              <Link
                href="/questoes/nova"
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: '#f97316', color: 'white', borderRadius: 10, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}
              >
                <Plus size={15} strokeWidth={2.5} /> Nova
              </Link>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {/* Matéria */}
            <select value={materiaId} onChange={e => setMateriaId(e.target.value)}
              style={{ padding: '8px 12px', fontSize: 13, borderRadius: 10, border: `1.5px solid ${materiaId ? '#f97316' : '#e2e8f0'}`, background: materiaId ? '#fff7ed' : 'white', fontFamily: 'inherit', color: '#1a1a1a', cursor: 'pointer' }}>
              <option value="">Matéria</option>
              {materias.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>

            {/* Tópico — aparece quando matéria tem tópicos */}
            {materiaId && topicos.length > 0 && (
              <select value={topicoId} onChange={e => setTopicoId(e.target.value)}
                style={{ padding: '8px 12px', fontSize: 13, borderRadius: 10, border: `1.5px solid ${topicoId ? '#f97316' : '#e2e8f0'}`, background: topicoId ? '#fff7ed' : 'white', fontFamily: 'inherit', color: '#1a1a1a', cursor: 'pointer' }}>
                <option value="">Tópico</option>
                {topicos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            )}

            {/* Subtópico — aparece quando tópico tem subtópicos */}
            {topicoId && subtopicos.length > 0 && (
              <select value={subtopico_id} onChange={e => setSubtopicoId(e.target.value)}
                style={{ padding: '8px 12px', fontSize: 13, borderRadius: 10, border: `1.5px solid ${subtopico_id ? '#0f2554' : '#e2e8f0'}`, background: subtopico_id ? '#eff6ff' : 'white', fontFamily: 'inherit', color: '#1a1a1a', cursor: 'pointer' }}>
                <option value="">Subtópico</option>
                {subtopicos.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            )}

            {/* Dificuldade, Concurso, Tipo */}
            {[
              { label: 'Dificuldade', value: difficulty, onChange: setDifficulty, options: DIFFICULTIES.map(d => ({ value: d, label: d })) },
              { label: 'Concurso',    value: source,     onChange: setSource,     options: SOURCES.map(s => ({ value: s, label: s })) },
              { label: 'Tipo',        value: type,       onChange: setType,       options: [{ value: 'multiple_choice', label: 'Objetiva' }, { value: 'discursive', label: 'Discursiva' }] },
            ].map(f => (
              <select key={f.label} value={f.value} onChange={e => f.onChange(e.target.value)}
                style={{ padding: '8px 12px', fontSize: 13, borderRadius: 10, border: '1.5px solid #e2e8f0', background: 'white', fontFamily: 'inherit', color: '#1a1a1a', cursor: 'pointer' }}>
                <option value="">{f.label}</option>
                {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ))}

            {(materiaId || topicoId || subtopico_id || difficulty || source || type) && (
              <button
                onClick={() => { setMateriaId(''); setTopicoId(''); setSubtopicoId(''); setDifficulty(''); setSource(''); setType(''); setNotFound(false) }}
                style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 10, padding: '8px 12px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                Limpar
              </button>
            )}
          </div>

          <button
            onClick={handleBuscar}
            disabled={fetching}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', background: '#0f2554', color: 'white', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: fetching ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: fetching ? 0.7 : 1 }}
          >
            <Search size={15} />
            {fetching ? 'Buscando…' : 'Buscar questões'}
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '60px 16px 0', textAlign: 'center', color: '#94a3b8' }}>
        {notFound ? (
          <>
            <BookOpen size={36} strokeWidth={1.5} style={{ marginBottom: 12, opacity: 0.4 }} />
            <div style={{ fontSize: 14, fontWeight: 500, color: '#64748b' }}>Nenhuma questão encontrada</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>Tente outros filtros</div>
          </>
        ) : (
          <>
            <BookOpen size={40} strokeWidth={1.2} style={{ opacity: 0.25, marginBottom: 12 }} />
            <div style={{ fontSize: 14, fontWeight: 500, color: '#64748b' }}>Selecione os filtros e clique em Buscar</div>
          </>
        )}
      </div>
      <Nav />
    </div>
  )
}

export default function QuestoesPage() {
  return (
    <Suspense>
      <QuestoesContent />
    </Suspense>
  )
}
