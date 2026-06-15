'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { dbQuery, dbInsert, dbUpdate } from '@/lib/supabase'
import type { Desafio, DesafioResposta } from '@/lib/questoes'
import { difficultyColor, difficultyBg } from '@/lib/questoes'
import LatexRenderer from '@/components/LatexRenderer'
import Nav from '@/components/Nav'
import { Plus, Feather, CheckCircle, Clock, XCircle, ChevronDown, ChevronUp, Send } from 'lucide-react'

type DesafioComResposta = Desafio & { resposta?: DesafioResposta }

function statusInfo(r: DesafioResposta | undefined) {
  if (!r)               return { label: 'Pendente',   color: '#d97706', bg: '#fef9c3', icon: Clock }
  if (r.validado === null) return { label: 'Aguardando', color: '#64748b', bg: '#f1f5f9', icon: Clock }
  if (r.validado)       return { label: 'Aprovado',   color: '#16a34a', bg: '#dcfce7', icon: CheckCircle }
  return                       { label: 'Reprovado',  color: '#dc2626', bg: '#fee2e2', icon: XCircle }
}

export default function DesafiosPage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()

  const [desafios, setDesafios]   = useState<DesafioComResposta[]>([])
  const [fetching, setFetching]   = useState(true)
  const [expanded, setExpanded]   = useState<string | null>(null)
  const [resposta, setResposta]   = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState<string | null>(null)

  // Para coordenador: lista todas as respostas
  const [todasRespostas, setTodasRespostas] = useState<Record<string, DesafioResposta[]>>({})
  const [validando, setValidando] = useState<string | null>(null)

  const isGestor = perfil?.papel === 'coordenador' || perfil?.papel === 'direcao'

  useEffect(() => {
    if (!loading && !perfil) { router.replace('/login'); return }
  }, [loading, perfil, router])

  useEffect(() => {
    if (!perfil) return
    const hoje = new Date().toISOString().slice(0, 10)

    async function load() {
      const { data: ds } = await dbQuery<Desafio>('desafios', {
        inicio: `lte.${hoje}`,
        fim:    `gte.${hoje}`,
        order:  'inicio.desc',
      })
      if (!ds) { setFetching(false); return }

      if (!isGestor) {
        const ids = ds.map(d => d.id).join(',')
        const { data: rs } = ids
          ? await dbQuery<DesafioResposta>('desafios_respostas', {
              aluno_id:   `eq.${perfil!.id}`,
              desafio_id: `in.(${ids})`,
            })
          : { data: [] }
        const rMap: Record<string, DesafioResposta> = {}
        ;(rs || []).forEach(r => { rMap[r.desafio_id] = r })
        setDesafios(ds.map(d => ({ ...d, resposta: rMap[d.id] })))
      } else {
        setDesafios(ds)
        // Busca todas as respostas para o gestor
        const ids = ds.map(d => d.id).join(',')
        if (ids) {
          const { data: rs } = await dbQuery<DesafioResposta>('desafios_respostas', {
            desafio_id: `in.(${ids})`,
            order: 'criado_em.desc',
          })
          const grouped: Record<string, DesafioResposta[]> = {}
          ;(rs || []).forEach(r => {
            if (!grouped[r.desafio_id]) grouped[r.desafio_id] = []
            grouped[r.desafio_id].push(r)
          })
          setTodasRespostas(grouped)
        }
      }
      setFetching(false)
    }
    load()
  }, [perfil])

  async function handleSubmit(desafioId: string, recompensa: number) {
    if (!perfil || !resposta[desafioId]?.trim()) return
    setSubmitting(desafioId)

    const { error } = await dbInsert('desafios_respostas', {
      desafio_id: desafioId,
      aluno_id:   perfil.id,
      resposta:   resposta[desafioId].trim(),
    })

    if (!error) {
      const novaResposta: DesafioResposta = {
        id: '', desafio_id: desafioId, aluno_id: perfil.id,
        resposta: resposta[desafioId].trim(),
        validado: null, penas_pagas: false,
        criado_em: new Date().toISOString(),
      }
      setDesafios(prev => prev.map(d => d.id === desafioId ? { ...d, resposta: novaResposta } : d))
      setExpanded(null)
    }
    setSubmitting(null)
  }

  async function handleValidar(respostaId: string, desafioId: string, aprovado: boolean, penas: number, alunoId: string) {
    setValidando(respostaId)
    await dbUpdate('desafios_respostas', { id: `eq.${respostaId}` }, { validado: aprovado, penas_pagas: aprovado })

    if (aprovado) {
      // Credita penas ao aluno
      await fetch('/api/penas/creditar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aluno_id: alunoId, valor: penas, tipo: 'desafio', descricao: `Desafio concluído — ${penas} penas` }),
      }).catch(() => {})
    }

    setTodasRespostas(prev => ({
      ...prev,
      [desafioId]: (prev[desafioId] || []).map(r => r.id === respostaId ? { ...r, validado: aprovado, penas_pagas: aprovado } : r),
    }))
    setValidando(null)
  }

  if (loading || !perfil) return null

  const hoje  = new Date().toISOString().slice(0, 10)

  return (
    <div style={{ padding: '0 0 80px' }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, background: '#F7F6F3', zIndex: 10, padding: '20px 16px 16px', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Feather size={18} color="#f97316" strokeWidth={2.5} />
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px' }}>Desafios da Semana</div>
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Resolva e ganhe Penas 🪶</div>
          </div>
          {isGestor && (
            <Link
              href="/desafios/novo"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: '#f97316', color: 'white', borderRadius: 10, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}
            >
              <Plus size={15} strokeWidth={2.5} /> Novo
            </Link>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {fetching && (
          <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 14, padding: 40 }}>Carregando…</div>
        )}

        {!fetching && desafios.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 16px' }}>
            <Feather size={40} strokeWidth={1.2} style={{ opacity: 0.25, marginBottom: 12, color: '#64748b' }} />
            <div style={{ fontSize: 14, fontWeight: 500, color: '#64748b' }}>Nenhum desafio esta semana ainda.</div>
            {isGestor && (
              <Link href="/desafios/novo" style={{ display: 'inline-block', marginTop: 16, color: '#f97316', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                + Criar primeiro desafio
              </Link>
            )}
          </div>
        )}

        {desafios.map(d => {
          const st       = statusInfo(d.resposta)
          const Icon     = st.icon
          const aberto   = expanded === d.id
          const prazo    = new Date(d.fim) < new Date(hoje) ? 'Encerrado' : `Até ${new Date(d.fim).toLocaleDateString('pt-BR')}`
          const resps    = todasRespostas[d.id] || []

          return (
            <div key={d.id} style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
              {/* Card header */}
              <div
                onClick={() => setExpanded(aberto ? null : d.id)}
                style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a' }}>{d.titulo}</div>
                    {d.dificuldade && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: difficultyBg(d.dificuldade), color: difficultyColor(d.dificuldade) }}>
                        {d.dificuldade}
                      </span>
                    )}
                    {d.materia && (
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: '#dbeafe', color: '#1e40af', fontWeight: 600 }}>
                        {d.materia}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#f97316' }}>
                      <Feather size={13} />
                      {d.recompensa} penas
                    </div>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>{prazo}</span>
                    {!isGestor && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: st.color, background: st.bg, padding: '2px 8px', borderRadius: 20 }}>
                        <Icon size={11} /> {st.label}
                      </span>
                    )}
                    {isGestor && (
                      <span style={{ fontSize: 11, color: '#64748b' }}>{resps.length} resposta{resps.length !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                </div>
                {aberto ? <ChevronUp size={18} color="#94a3b8" /> : <ChevronDown size={18} color="#94a3b8" />}
              </div>

              {/* Expandido */}
              {aberto && (
                <div style={{ padding: '0 20px 20px', borderTop: '1px solid #f1f5f9' }}>
                  {d.enunciado && (
                    <div style={{ padding: '14px 0', borderBottom: '1px solid #f1f5f9', marginBottom: 14 }}>
                      <LatexRenderer text={d.enunciado} />
                    </div>
                  )}

                  {/* Aluno: formulário de resposta */}
                  {!isGestor && !d.resposta && (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>Sua resposta</div>
                      <textarea
                        value={resposta[d.id] || ''}
                        onChange={e => setResposta(prev => ({ ...prev, [d.id]: e.target.value }))}
                        placeholder="Escreva sua resolução aqui…"
                        rows={5}
                        style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', outline: 'none' }}
                      />
                      <button
                        onClick={() => handleSubmit(d.id, d.recompensa)}
                        disabled={!resposta[d.id]?.trim() || submitting === d.id}
                        style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 7, padding: '10px 20px', background: '#f97316', color: 'white', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: !resposta[d.id]?.trim() || submitting === d.id ? 0.6 : 1 }}
                      >
                        <Send size={13} /> {submitting === d.id ? 'Enviando…' : 'Enviar resposta'}
                      </button>
                    </div>
                  )}

                  {!isGestor && d.resposta && (
                    <div style={{ background: '#f8fafc', borderRadius: 10, padding: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Sua resposta enviada</div>
                      <div style={{ fontSize: 13, color: '#1a1a1a', lineHeight: 1.6 }}>{d.resposta.resposta}</div>
                      {d.resposta.validado === true && (
                        <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: '#15803d', background: '#dcfce7', borderRadius: 8, padding: '6px 12px', display: 'inline-block' }}>
                          🪶 +{d.recompensa} penas creditadas!
                        </div>
                      )}
                    </div>
                  )}

                  {/* Gestor: lista de respostas */}
                  {isGestor && (
                    <div>
                      {resps.length === 0 ? (
                        <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: 20 }}>Nenhuma resposta ainda.</div>
                      ) : resps.map(r => (
                        <div key={r.id} style={{ background: '#f8fafc', borderRadius: 10, padding: 14, marginBottom: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>
                              {new Date(r.criado_em).toLocaleDateString('pt-BR')}
                            </div>
                            {r.validado === null && (
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  disabled={validando === r.id}
                                  onClick={() => handleValidar(r.id, d.id, true, d.recompensa, r.aluno_id)}
                                  style={{ padding: '5px 12px', background: '#dcfce7', color: '#15803d', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                                >
                                  ✓ Aprovar
                                </button>
                                <button
                                  disabled={validando === r.id}
                                  onClick={() => handleValidar(r.id, d.id, false, 0, r.aluno_id)}
                                  style={{ padding: '5px 12px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                                >
                                  ✕ Reprovar
                                </button>
                              </div>
                            )}
                            {r.validado !== null && (
                              <span style={{ fontSize: 11, fontWeight: 600, color: r.validado ? '#15803d' : '#dc2626', background: r.validado ? '#dcfce7' : '#fee2e2', padding: '3px 10px', borderRadius: 20 }}>
                                {r.validado ? '✓ Aprovado' : '✕ Reprovado'}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 13, color: '#1a1a1a', lineHeight: 1.6 }}>{r.resposta}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <Nav />
    </div>
  )
}
