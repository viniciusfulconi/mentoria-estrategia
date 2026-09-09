'use client'
import { useEffect, useMemo, useState } from 'react'
import LatexRenderer from '@/components/LatexRenderer'
import { getToken } from '@/lib/supabase'
import { ENEM_AREAS, type EnemArea } from '@/lib/tri/tipos'
import { X } from 'lucide-react'

type Questao = {
  n: number; qid: string; code: number | null; area: EnemArea
  marcada: string | null; gabarito: string | null
  acertou: boolean; anulada: boolean; respondeu: boolean
  dificuldade: string | null; pCorrect: number | null
  dist: { a: number; b: number; c: number; d: number; e: number; branco: number } | null
  nParticipantes: number | null
  impacto: 'alto' | 'médio' | 'baixo' | null
  materia: string | null; topico: string | null; subtopico: string | null
  enunciado: string; alternativas: { letter: string; text: string }[]; solucao: string | null
}
type Dados = {
  detalhe: Record<string, Questao[]>
  materias: { materia: string; area: EnemArea; acertos: number; total: number; pct: number }[]
  ranking: Record<string, { rank: number; total: number; percentil: number | null; nota: number }>
}

const LETRAS = ['a', 'b', 'c', 'd', 'e'] as const

function corBolha(q: Questao) {
  if (q.anulada) return { bg: '#E0E7FF', bd: '#818CF8', fg: '#3730A3' }   // anulada credita todos
  if (!q.respondeu) return { bg: '#F1F5F9', bd: '#CBD5E1', fg: '#94A3B8' } // em branco
  return q.acertou
    ? { bg: '#DCFCE7', bd: '#4ADE80', fg: '#166534' }
    : { bg: '#FEE2E2', bd: '#F87171', fg: '#991B1B' }
}

export default function RelatorioEnem({ tentativaId }: { tentativaId: string }) {
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState('')
  const [aberta, setAberta] = useState<Questao | null>(null)

  useEffect(() => {
    let vivo = true
    fetch('/api/enem/resultado', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ tentativa_id: tentativaId }),
    })
      .then(async r => { if (!r.ok) throw new Error((await r.json()).error || 'Falha ao carregar'); return r.json() })
      .then(d => { if (vivo) setDados(d) })
      .catch(e => { if (vivo) setErro(e.message) })
    return () => { vivo = false }
  }, [tentativaId])

  const porArea = useMemo(() => ENEM_AREAS.filter(a => dados?.detalhe?.[a.key]?.length), [dados])

  if (erro) return <div style={{ background: 'var(--red-light)', color: '#991b1b', padding: '10px 13px', borderRadius: 10, fontSize: 13 }}>{erro}</div>
  if (!dados) return <div style={{ color: 'var(--text-hint)', fontSize: 13, padding: 20, textAlign: 'center' }}>Montando o relatório…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Ranking: nota geral em destaque + áreas ─────────────────── */}
      {dados.ranking.GERAL && (
        <div style={{
          background: 'linear-gradient(135deg, #12305f, #0a1a3a)', borderRadius: 18, padding: '18px 20px',
          display: 'flex', alignItems: 'center', gap: 18, color: 'white',
          boxShadow: '0 8px 30px rgba(15,37,84,0.28)',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)' }}>
              Média geral
            </div>
            <div style={{
              fontFamily: 'var(--font-display), sans-serif', fontSize: 40, fontWeight: 800,
              fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1,
            }}>
              {dados.ranking.GERAL.nota.toFixed(1)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#fdba74', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {dados.ranking.GERAL.rank}º
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 4 }}>
              de {dados.ranking.GERAL.total}
              {dados.ranking.GERAL.percentil != null && ` · top ${100 - dados.ranking.GERAL.percentil + 1}%`}
            </div>
          </div>
        </div>
      )}
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
        {porArea.map(a => {
          const r = dados.ranking[a.key]
          if (!r) return null
          return (
            <div key={a.key} style={{
              background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14,
              padding: '12px 13px', boxShadow: 'var(--shadow-xs)',
            }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: .4, color: 'var(--text-hint)' }}>{a.short}</div>
              <div style={{ fontSize: 21, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: 'var(--navy)', lineHeight: 1.2, letterSpacing: '-0.01em' }}>
                {r.nota.toFixed(1)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {r.rank}º de {r.total}
                {r.percentil != null && <span style={{ color: 'var(--text-hint)' }}> · top {100 - r.percentil + 1}%</span>}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Acertos por matéria ───────────────────────────────────── */}
      <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: '13px 15px' }}>
        <div style={{ fontFamily: 'var(--font-display), sans-serif', fontSize: 14.5, fontWeight: 700, marginBottom: 12, color: 'var(--navy)', letterSpacing: '-0.01em' }}>Acertos por matéria</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {dados.materias.map(m => (
            <div key={m.materia} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5 }}>
              <span style={{ width: 128, flex: 'none', color: 'var(--text-muted)' }}>{m.materia}</span>
              <div style={{ flex: 1, height: 8, background: 'var(--bg)', borderRadius: 20, overflow: 'hidden' }}>
                <div style={{
                  width: `${m.pct}%`, height: '100%', borderRadius: 20,
                  background: m.pct >= 70 ? 'var(--teal)' : m.pct >= 50 ? 'var(--amber)' : 'var(--red)',
                }} />
              </div>
              <span style={{ width: 62, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-hint)', fontSize: 11.5 }}>
                {m.acertos}/{m.total}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Mapa de questões ──────────────────────────────────────── */}
      {porArea.map(area => {
        const qs = dados.detalhe[area.key] as Questao[]
        const acertos = qs.filter(q => q.acertou).length
        return (
          <div key={area.key} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: '13px 15px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontFamily: 'var(--font-display), sans-serif', fontSize: 14.5, fontWeight: 700, color: 'var(--navy)', letterSpacing: '-0.01em' }}>{area.label}</span>
              <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                <b style={{ color: 'var(--teal-dark)', fontVariantNumeric: 'tabular-nums' }}>{acertos}</b>/{qs.length} acertos
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {qs.map(q => {
                const c = corBolha(q)
                return (
                  <button key={q.qid} onClick={() => setAberta(q)}
                    title={`Questão ${q.n}${q.materia ? ' · ' + q.materia : ''}${q.anulada ? ' · anulada' : ''}`}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 10px rgba(15,37,84,0.15)' }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}
                    style={{
                      width: 31, height: 31, borderRadius: 9, cursor: 'pointer',
                      border: `1px solid ${c.bd}`, background: c.bg, color: c.fg,
                      fontSize: 11.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                      transition: 'transform .15s ease, box-shadow .15s ease',
                    }}>
                    {q.n}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--text-muted)' }}>
        {[['#DCFCE7', '#4ADE80', 'acertou'], ['#FEE2E2', '#F87171', 'errou'],
          ['#F1F5F9', '#CBD5E1', 'em branco'], ['#E0E7FF', '#818CF8', 'anulada']].map(([bg, bd, l]) => (
          <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 12, height: 12, borderRadius: 4, background: bg, border: `1px solid ${bd}` }} /> {l}
          </span>
        ))}
      </div>

      {/* ── Modal da questão ──────────────────────────────────────── */}
      {aberta && (
        <div onClick={() => setAberta(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 100,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 12,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'white', borderRadius: 16, width: '100%', maxWidth: 680,
            maxHeight: '88vh', overflowY: 'auto', padding: '18px 20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Questão {aberta.n}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-hint)', marginTop: 2 }}>
                  {[aberta.materia, aberta.topico, aberta.dificuldade].filter(Boolean).join(' · ')}
                  {aberta.impacto && ` · impacto ${aberta.impacto}`}
                </div>
              </div>
              <button onClick={() => setAberta(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, fontSize: 12 }}>
              <span style={{ padding: '3px 9px', borderRadius: 20, background: corBolha(aberta).bg, color: corBolha(aberta).fg, fontWeight: 600 }}>
                {aberta.anulada ? 'Anulada' : !aberta.respondeu ? 'Em branco' : aberta.acertou ? 'Acertou' : 'Errou'}
              </span>
              {aberta.marcada && <span style={{ color: 'var(--text-muted)' }}>marcou <b>{aberta.marcada.toUpperCase()}</b></span>}
              {aberta.gabarito && <span style={{ color: 'var(--text-muted)' }}>gabarito <b>{aberta.gabarito.toUpperCase()}</b></span>}
              {aberta.pCorrect != null && (
                <span style={{ color: 'var(--text-muted)' }}>
                  {aberta.pCorrect.toFixed(0)}% acertaram no Brasil
                </span>
              )}
            </div>

            {aberta.dist && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--text-hint)', marginBottom: 5 }}>
                  Como o Brasil respondeu{aberta.nParticipantes ? ` (${aberta.nParticipantes.toLocaleString('pt-BR')} participantes)` : ''}
                </div>
                {LETRAS.map(l => {
                  const v = (aberta.dist as any)[l] as number
                  const ehGab = aberta.gabarito === l
                  return (
                    <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, marginBottom: 3 }}>
                      <span style={{ width: 14, fontWeight: ehGab ? 700 : 400, color: ehGab ? 'var(--teal-dark)' : 'var(--text-muted)' }}>
                        {l.toUpperCase()}
                      </span>
                      <div style={{ flex: 1, height: 7, background: 'var(--bg)', borderRadius: 20, overflow: 'hidden' }}>
                        <div style={{ width: `${v.toFixed(1)}%`, height: '100%', background: ehGab ? 'var(--teal)' : 'var(--border-strong)' }} />
                      </div>
                      <span style={{ width: 38, textAlign: 'right', color: 'var(--text-hint)', fontVariantNumeric: 'tabular-nums' }}>
                        {v.toFixed(0)}%
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {aberta.enunciado && (
              <div style={{ fontSize: 13.5, lineHeight: 1.6, marginBottom: 12 }}>
                <LatexRenderer text={aberta.enunciado} />
              </div>
            )}

            {aberta.alternativas?.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
                {aberta.alternativas.map(alt => {
                  const l = alt.letter?.toLowerCase()
                  const ehGab = l === aberta.gabarito
                  const ehMinha = l === aberta.marcada
                  return (
                    <div key={alt.letter} style={{
                      display: 'flex', gap: 8, padding: '7px 10px', borderRadius: 9, fontSize: 13,
                      background: ehGab ? '#F0FDF4' : ehMinha ? '#FEF2F2' : 'transparent',
                      border: `1px solid ${ehGab ? '#BBF7D0' : ehMinha ? '#FECACA' : 'var(--border)'}`,
                    }}>
                      <b style={{ color: ehGab ? 'var(--teal-dark)' : ehMinha ? '#991B1B' : 'var(--text-muted)' }}>
                        {alt.letter?.toUpperCase()}
                      </b>
                      <div style={{ flex: 1 }}><LatexRenderer text={alt.text} /></div>
                    </div>
                  )
                })}
              </div>
            )}

            {aberta.solucao && (
              <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '11px 13px', fontSize: 13, lineHeight: 1.6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .4, color: 'var(--text-hint)', marginBottom: 6 }}>
                  Resolução
                </div>
                <LatexRenderer text={aberta.solucao} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
