'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { dbQuery, dbDelete } from '@/lib/supabase'
import { difficultyColor, difficultyBg } from '@/lib/questoes'
import type { Question } from '@/lib/questoes'
import LatexRenderer from '@/components/LatexRenderer'
import Nav from '@/components/Nav'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'

export default function QuestaoDetalhePage() {
  const { perfil, loading } = useAuth()
  const router  = useRouter()
  const params  = useParams()
  const id      = params.id as string

  const [question, setQuestion] = useState<Question | null>(null)
  const [fetching, setFetching] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [showSolution, setShowSolution] = useState(false)

  useEffect(() => {
    if (!loading && !perfil) { router.replace('/login'); return }
  }, [loading, perfil, router])

  useEffect(() => {
    if (!perfil || !id) return
    dbQuery<Question>('questions', { id: `eq.${id}` }).then(({ data }) => {
      setQuestion(data?.[0] ?? null)
      setFetching(false)
    })
  }, [perfil, id])

  async function handleDelete() {
    if (!perfil || !question) return
    if (!confirm('Excluir esta questão?')) return
    setDeleting(true)
    await dbDelete('questions', { id: `eq.${id}` })
    router.push('/questoes')
  }

  if (loading || !perfil) return null

  const podeEditar = question && (perfil.papel === 'coordenador' || question.created_by === perfil.id)

  if (fetching) {
    return (
      <div style={{ padding: '40px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
        Carregando…
      </div>
    )
  }

  if (!question) {
    return (
      <div style={{ padding: '40px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#64748b', marginBottom: 12 }}>Questão não encontrada.</div>
        <Link href="/questoes" style={{ color: '#f97316', textDecoration: 'none', fontSize: 13 }}>← Voltar</Link>
      </div>
    )
  }

  return (
    <div style={{ padding: '0 0 80px' }}>
      <div style={{ position: 'sticky', top: 0, background: '#F7F6F3', zIndex: 10, padding: '16px 16px 14px', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link href="/questoes" style={{ color: '#64748b', display: 'flex' }}>
              <ArrowLeft size={20} strokeWidth={2} />
            </Link>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px' }}>Questão</div>
          </div>
          {podeEditar && (
            <div style={{ display: 'flex', gap: 8 }}>
              <Link
                href={`/questoes/${id}/editar`}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#0f2554', color: 'white', borderRadius: 10, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}
              >
                <Pencil size={13} /> Editar
              </Link>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <Trash2 size={13} /> {deleting ? 'Excluindo…' : 'Excluir'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Badges */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {question.difficulty && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: difficultyBg(question.difficulty), color: difficultyColor(question.difficulty) }}>
              {question.difficulty}
            </span>
          )}
          <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: '#dbeafe', color: '#1e40af' }}>
            {question.subject}
          </span>
          {question.topic && (
            <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#f1f5f9', color: '#475569' }}>
              {question.topic}
            </span>
          )}
          {question.subtopic && (
            <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#f1f5f9', color: '#475569' }}>
              {question.subtopic}
            </span>
          )}
          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#f1f5f9', color: '#475569' }}>
            {question.type === 'multiple_choice' ? 'Objetiva' : 'Discursiva'}
          </span>
          {question.source && (
            <span style={{ fontSize: 11, color: '#94a3b8' }}>{question.source}{question.year ? ` ${question.year}` : ''}</span>
          )}
          {question.vertical && (
            <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#fef3c7', color: '#92400e' }}>
              {question.vertical}
            </span>
          )}
        </div>

        {/* Enunciado */}
        <div style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>Enunciado</div>
          <LatexRenderer text={question.statement} />
        </div>

        {/* Alternativas + gabarito */}
        {question.type === 'multiple_choice' && question.alternatives && (
          <div style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>Alternativas</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {question.alternatives.map(alt => {
                const isAnswer = alt.letter.toUpperCase() === (question.answer || '').toUpperCase()
                return (
                  <div key={alt.letter} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px', borderRadius: 10,
                    background: isAnswer ? '#dcfce7' : 'white',
                    border: `1.5px solid ${isAnswer ? '#16a34a' : '#e2e8f0'}`,
                  }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isAnswer ? '#16a34a' : 'white',
                      color: isAnswer ? 'white' : '#94a3b8',
                      fontWeight: 700, fontSize: 12,
                      border: `1.5px solid ${isAnswer ? '#16a34a' : '#cbd5e1'}`,
                    }}>
                      {alt.letter}
                    </div>
                    <div style={{ flex: 1, paddingTop: 2 }}><LatexRenderer text={alt.text} /></div>
                    {isAnswer && <span style={{ fontSize: 11, color: '#15803d', fontWeight: 600, flexShrink: 0, marginTop: 4 }}>✓ gabarito</span>}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Resolução */}
        {question.solution && (
          <div style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showSolution ? 12 : 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Resolução</div>
              <button
                onClick={() => setShowSolution(v => !v)}
                style={{ fontSize: 12, color: '#f97316', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
              >
                {showSolution ? 'Ocultar' : 'Ver resolução'}
              </button>
            </div>
            {showSolution && <LatexRenderer text={question.solution} />}
          </div>
        )}

        {/* Tags */}
        {question.tags && question.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {question.tags.map(tag => (
              <span key={tag} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#f1f5f9', color: '#64748b' }}>
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
      <Nav />
    </div>
  )
}
