'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { dbInsert, dbQuery } from '@/lib/supabase'
import { DIFFICULTIES, SUBJECTS } from '@/lib/questoes'
import type { Question } from '@/lib/questoes'
import RichTextArea from '@/components/RichTextArea'
import Nav from '@/components/Nav'
import { ArrowLeft } from 'lucide-react'

export default function NovoDesafioPage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()

  const [titulo, setTitulo]         = useState('')
  const [enunciado, setEnunciado]   = useState('')
  const [materia, setMateria]       = useState('')
  const [dificuldade, setDificuldade] = useState('')
  const [recompensa, setRecompensa] = useState('100')
  const [vertical, setVertical]     = useState<'ITA' | 'Medicina' | ''>('')
  const [questionId, setQuestionId] = useState('')
  const [inicio, setInicio]         = useState(getMonday())
  const [fim, setFim]               = useState(getSunday())

  const [questoes, setQuestoes]     = useState<Question[]>([])
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  useEffect(() => {
    if (!loading && !perfil) { router.replace('/login'); return }
    if (!loading && perfil && perfil.papel !== 'coordenador' && perfil.papel !== 'direcao') {
      router.replace('/desafios')
    }
  }, [loading, perfil, router])

  useEffect(() => {
    if (!perfil) return
    dbQuery<Question>('questions', { order: 'created_at.desc' }, 'id,subject,topic,statement,difficulty').then(({ data }) => {
      setQuestoes(data || [])
    })
  }, [perfil])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!titulo.trim())   { setError('Informe o título do desafio.'); return }
    if (!inicio || !fim)  { setError('Informe as datas de início e fim.'); return }
    if (new Date(inicio) > new Date(fim)) { setError('A data de início deve ser antes do fim.'); return }
    if (!perfil) return

    setSaving(true)
    setError('')

    const body: Record<string, any> = {
      titulo:     titulo.trim(),
      enunciado:  enunciado.trim() || null,
      materia:    materia    || null,
      dificuldade: dificuldade || null,
      recompensa: parseInt(recompensa) || 100,
      vertical:   vertical   || null,
      question_id: questionId || null,
      inicio,
      fim,
      criado_por: perfil.id,
    }

    const { error: err } = await dbInsert('desafios', body)
    if (err) { setError(err); setSaving(false) }
    else     router.push('/desafios')
  }

  if (loading || !perfil) return null

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    border: '1.5px solid #e2e8f0', fontSize: 13, fontFamily: 'inherit',
    outline: 'none', boxSizing: 'border-box', background: 'white',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6,
  }

  return (
    <div style={{ padding: '0 0 80px' }}>
      <div style={{ position: 'sticky', top: 0, background: '#F7F6F3', zIndex: 10, padding: '16px 16px 14px', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/desafios" style={{ color: '#64748b', display: 'flex' }}>
            <ArrowLeft size={20} strokeWidth={2} />
          </Link>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px' }}>Novo Desafio</div>
        </div>
      </div>

      <form onSubmit={handleSave}>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Identificação */}
          <div style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
              Identificação
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Título *</label>
                <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Desafio de Física — Semana 23" style={inputStyle} required />
              </div>
              <div>
                <label style={labelStyle}>Matéria</label>
                <select value={materia} onChange={e => setMateria(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">Selecionar…</option>
                  {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Dificuldade</label>
                <select value={dificuldade} onChange={e => setDificuldade(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">Selecionar…</option>
                  {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Recompensa (Penas 🪶)</label>
                <input type="number" min={1} max={1000} value={recompensa} onChange={e => setRecompensa(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Vertical</label>
                <select value={vertical} onChange={e => setVertical(e.target.value as any)} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">Ambas</option>
                  <option value="ITA">ITA</option>
                  <option value="Medicina">Medicina</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Início</label>
                <input type="date" value={inicio} onChange={e => setInicio(e.target.value)} style={inputStyle} required />
              </div>
              <div>
                <label style={labelStyle}>Fim</label>
                <input type="date" value={fim} onChange={e => setFim(e.target.value)} style={inputStyle} required />
              </div>
            </div>
          </div>

          {/* Enunciado */}
          <div style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
            <RichTextArea
              label="Enunciado"
              optional
              value={enunciado}
              onChange={setEnunciado}
              placeholder="Enunciado do problema. Suporta LaTeX ($...$) e múltiplos parágrafos."
              rows={6}
            />
          </div>

          {/* Vincular questão do banco */}
          <div style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Vincular questão do banco</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>Opcional — ao invés de escrever o enunciado acima, você pode apontar para uma questão existente.</div>
            <select value={questionId} onChange={e => setQuestionId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">Nenhuma (usar enunciado acima)</option>
              {questoes.map(q => (
                <option key={q.id} value={q.id}>
                  [{q.subject}{q.topic ? ` · ${q.topic}` : ''}] {q.statement.slice(0, 80)}{q.statement.length > 80 ? '…' : ''}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div style={{ background: '#fee2e2', color: '#dc2626', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            style={{ alignSelf: 'flex-start', padding: '12px 28px', background: '#f97316', color: 'white', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Criando…' : 'Criar desafio'}
          </button>
        </div>
      </form>
      <Nav />
    </div>
  )
}

function getMonday() {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().slice(0, 10)
}

function getSunday() {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + 7
  d.setDate(diff)
  return d.toISOString().slice(0, 10)
}
