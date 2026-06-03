'use client'
import { useMemo, useState } from 'react'
import { APROVADOS_ITA } from '@/lib/data/aprovadosITA'

interface Props {
  rankings: any[]  // rows fase === 'ranking', sorted by ciclo
}

function avg(arr: number[]) {
  if (!arr.length) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

// ── Referências ITA (Ampla Concorrência) — pré-computadas ──────────────────
const AC24 = APROVADOS_ITA.filter(a => a.ano === 2024 && a.modalidade === 'Ampla Concorrencia')
const AC25 = APROVADOS_ITA.filter(a => a.ano === 2025 && a.modalidade === 'Ampla Concorrencia')
const ALL_AC = [...AC24, ...AC25]

// Menor nota de um aprovado em cada critério (Ampla Concorrência, 2024+2025)
const PISO: Record<string, number> = {
  media1fase: Math.min(...ALL_AC.map(a => a.media1fase)),
  matematica: Math.min(...ALL_AC.map(a => a.matematica)),
  fisica:     Math.min(...ALL_AC.map(a => a.fisica)),
  quimica:    Math.min(...ALL_AC.map(a => a.quimica)),
  portRed:    Math.min(...ALL_AC.map(a => a.portRed)),
  media2fase: Math.min(...ALL_AC.map(a => a.media2fase)),
}

const ITA = {
  2024: {
    media1fase: 7.7797, matematica: 7.9000, fisica: 8.1391, quimica: 7.2930, portRed: 6.9018,
    media2fase: 7.6027, corte: 7.1805,
    min: { matematica: 4.90, fisica: 5.30, quimica: 5.10, portRed: 4.63 },
  },
  2025: {
    media1fase: 8.0092, matematica: 8.2628, fisica: 7.5523, quimica: 7.5983, portRed: 6.9840,
    media2fase: 7.6813, corte: 7.2983,
    min: { matematica: 5.15, fisica: 5.05, quimica: 5.23, portRed: 4.33 },
  },
} as const

type Ano = 2024 | 2025

// Mapeamento dos campos do banco → referência ITA
const CAMPOS = [
  { label: '1ª Fase',   campo: 'media_1fase',     refKey: 'media1fase',  minKey: null },
  { label: 'Matemática',campo: 'nota_matematica',  refKey: 'matematica',  minKey: 'matematica' },
  { label: 'Física',    campo: 'nota_fisica',      refKey: 'fisica',      minKey: 'fisica' },
  { label: 'Química',   campo: 'nota_quimica',     refKey: 'quimica',     minKey: 'quimica' },
  { label: 'Port./Red.',campo: 'media_linguagens', refKey: 'portRed',     minKey: 'portRed' },
  { label: 'Nota Final', campo: 'media_2fase',      refKey: 'media2fase',  minKey: null },
] as const

type CampoKey = typeof CAMPOS[number]['campo']
type RefKey   = typeof CAMPOS[number]['refKey']

// ── Helpers de cor ──────────────────────────────────────────────────────────
function corCelula(val: number | null, itaRef: number): string {
  if (val === null) return 'transparent'
  return val >= itaRef ? '#F0FDF4' : '#FEF2F2'
}

function corValor(val: number | null, itaRef: number): string {
  if (val === null) return '#ccc'
  return val >= itaRef ? '#16A34A' : '#DC2626'
}

function delta(val: number, ref: number): string {
  const d = val - ref
  return (d >= 0 ? '+' : '') + d.toFixed(2)
}

// Nota final ITA = média aritmética das 5 componentes (peso 20% cada)
// Retorna null se qualquer campo estiver faltando
function mediaFinalITA(r: any): number | null {
  const vals = [r.media_1fase, r.nota_matematica, r.nota_fisica, r.nota_quimica, r.media_linguagens]
    .map(v => (v !== null && v !== undefined && v !== '') ? Number(v) : null)
  if (vals.some(v => v === null)) return null
  return (vals as number[]).reduce((a, b) => a + b, 0) / 5
}

// ── Componente principal ────────────────────────────────────────────────────
export default function Termometro({ rankings }: Props) {
  const [anoITA, setAnoITA] = useState<Ano>(2025)

  // Apenas ciclos ITA (exclui IME pelo campo concurso e pelo nome do ciclo)
  const ciclos = [...rankings]
    .filter(r => {
      const concurso = String(r.concurso ?? '').toUpperCase()
      const nome = String(r.ciclo_nome ?? '').toUpperCase()
      return concurso !== 'IME' && !nome.includes('IME')
    })
    .sort((a, b) =>
      parseInt(a.ciclo_nome?.match(/\d+/)?.[0] || '0') - parseInt(b.ciclo_nome?.match(/\d+/)?.[0] || '0')
    )

  // Médias do aluno em todos os ciclos com dados
  const mediasAluno = useMemo(() => {
    const result: Record<CampoKey, number | null> = {
      media_1fase: null, nota_matematica: null, nota_fisica: null,
      nota_quimica: null, media_linguagens: null, media_2fase: null,
    }
    for (const c of CAMPOS) {
      const vals = ciclos.map(r => r[c.campo]).filter(v => v !== null && v !== undefined && Number(v) > 0).map(Number)
      result[c.campo] = vals.length ? avg(vals) : null
    }
    return result
  }, [ciclos])

  type SubjectInsight = {
    label: string; campo: CampoKey; val: number; ref: number; piso: number; gap: number; abaixoPiso: boolean
  }

  // ── Painel de insights estratégicos ────────────────────────────────────────
  const insights = useMemo(() => {
    if (!ciclos.length) return null

    // Último ciclo com todos os 5 campos para calcular nota final ITA
    const comMediaFinal = ciclos.map(r => ({ r, mf: mediaFinalITA(r) })).filter(x => x.mf !== null)
    const latestEntry = comMediaFinal[comMediaFinal.length - 1]
    const m2fLatest = latestEntry?.mf ?? null
    const latestCiclo = latestEntry?.r.ciclo_nome?.replace(' - ITA', '').replace('Ciclo ', 'C') ?? null
    const aprovado = m2fLatest !== null ? m2fLatest >= ITA[anoITA].corte : null
    const gapCorte = m2fLatest !== null ? m2fLatest - ITA[anoITA].corte : null

    // Análise por matéria (média de todos os ciclos)
    const subjects: SubjectInsight[] = ([
      { label: 'Matemática', campo: 'nota_matematica' as CampoKey, refKey: 'matematica'     as const },
      { label: 'Física',     campo: 'nota_fisica'     as CampoKey, refKey: 'fisica'         as const },
      { label: 'Química',    campo: 'nota_quimica'    as CampoKey, refKey: 'quimica'        as const },
      { label: 'Port./Red.', campo: 'media_linguagens'as CampoKey, refKey: 'portRed'        as const },
    ] as const).reduce<SubjectInsight[]>((acc, s) => {
      const val = mediasAluno[s.campo]
      if (val === null) return acc
      const ref = ITA[anoITA][s.refKey] as number
      const piso = PISO[s.refKey] ?? 0
      acc.push({ label: s.label, campo: s.campo, val, ref, piso, gap: val - ref, abaixoPiso: val < piso })
      return acc
    }, [])

    if (!subjects.length) return null

    const sorted = [...subjects].sort((a, b) => a.gap - b.gap)
    const maisDistante = sorted[0]
    const maisForte    = sorted[sorted.length - 1]
    const criticas     = subjects.filter(s => s.abaixoPiso)

    let sugestao = ''
    if (aprovado) {
      const forte = maisForte.gap >= 0 ? maisForte.label : `${maisForte.label} (o mais próximo da média)`
      sugestao = `Mantenha ${forte} e continue trabalhando ${maisDistante.label} para consolidar sua posição.`
    } else if (criticas.length > 0) {
      const pior = [...criticas].sort((a, b) => a.gap - b.gap)[0]
      sugestao = `${pior.label} está abaixo do piso mínimo dos aprovados (${pior.val.toFixed(2)} vs piso ${pior.piso.toFixed(2)}). Risco de eliminação — este é o ponto crítico a atacar agora.`
    } else if (gapCorte !== null) {
      const pontosNec = (Math.abs(gapCorte) * 5).toFixed(2)
      sugestao = `Falta ${Math.abs(gapCorte).toFixed(2)} pts na nota final para o corte — equivale a ${pontosNec} pts no somatório das 5 componentes. Comece por ${maisDistante.label}: é onde há mais a ganhar (${Math.abs(maisDistante.gap).toFixed(2)} pts abaixo da média ITA).`
    }

    return { aprovado, m2fLatest, gapCorte, latestCiclo, subjects, sorted, maisDistante, maisForte, criticas, sugestao }
  }, [ciclos, mediasAluno, anoITA])

  // ── Ponto fraco estratégico ───────────────────────────────────────────────
  const pontoFraco = useMemo(() => {
    const analise = [
      { label: 'Matemática', campo: 'nota_matematica' as CampoKey, avg: ITA[anoITA].matematica, min: ITA[anoITA].min.matematica },
      { label: 'Física',     campo: 'nota_fisica'     as CampoKey, avg: ITA[anoITA].fisica,     min: ITA[anoITA].min.fisica },
      { label: 'Química',    campo: 'nota_quimica'    as CampoKey, avg: ITA[anoITA].quimica,     min: ITA[anoITA].min.quimica },
      { label: 'Port./Red.', campo: 'media_linguagens'as CampoKey, avg: ITA[anoITA].portRed,     min: ITA[anoITA].min.portRed },
    ].map(m => {
      const v = mediasAluno[m.campo]
      return {
        ...m,
        valor: v,
        gapPiso: v !== null ? v - m.min : null,
        gapMedia: v !== null ? v - m.avg : null,
      }
    }).filter(m => m.valor !== null)

    return analise.sort((a, b) => (a.gapPiso ?? 0) - (b.gapPiso ?? 0))
  }, [mediasAluno, anoITA])

  if (!ciclos.length) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
        Nenhum dado de simulado disponível ainda.
      </div>
    )
  }

  return (
    <div style={{ paddingBottom: 20 }}>

      {/* ── Seletor de ano ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {([2024, 2025] as Ano[]).map(ano => (
          <button key={ano} onClick={() => setAnoITA(ano)} style={{
            padding: '6px 20px', borderRadius: 20, fontSize: 12, fontWeight: 600,
            border: 'none', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
            background: anoITA === ano ? '#2563EB' : '#F1F5F9',
            color: anoITA === ano ? 'white' : '#666',
          }}>
            ITA {ano}
          </button>
        ))}
      </div>

      {/* ── Painel de Insights ───────────────────────────────────────── */}
      {insights && (
        <div style={{ marginBottom: 16 }}>

          {/* Aprovado */}
          {insights.aprovado && (
            <div style={{
              background: 'linear-gradient(135deg, #F0FDF4, #DCFCE7)',
              border: '1.5px solid #86EFAC', borderRadius: 14,
              padding: '14px 16px', marginBottom: 10,
              display: 'flex', gap: 12, alignItems: 'center',
            }}>
              <div style={{ fontSize: 30, flexShrink: 0 }}>🎉</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#14532D' }}>
                  Seria aprovado no ITA {anoITA}!
                </div>
                <div style={{ fontSize: 12, color: '#166534', marginTop: 3 }}>
                  {insights.latestCiclo && <span style={{ color: '#166534', marginRight: 8 }}>{insights.latestCiclo} ·</span>}
                  Nota final: <strong>{insights.m2fLatest!.toFixed(4)}</strong>
                  <span style={{ color: '#16A34A', fontWeight: 700, marginLeft: 8 }}>
                    +{insights.gapCorte!.toFixed(4)} acima do corte
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Chips por matéria */}
          <div style={{
            background: 'white', borderRadius: 14,
            border: '0.5px solid rgba(0,0,0,0.08)',
            padding: '12px 14px', marginBottom: 10,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#666', marginBottom: 8 }}>
              Sua média nos simulados vs ITA {anoITA}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {insights.subjects.map(s => {
                const acima = s.gap >= 0
                const isMaisDistante = s.campo === insights.maisDistante.campo
                const isMaisForte    = s.campo === insights.maisForte.campo
                const icon = isMaisDistante ? '⚠' : isMaisForte && acima ? '🔥' : acima ? '✓' : '↓'
                return (
                  <div key={s.campo} style={{
                    borderRadius: 20, padding: '5px 11px', fontSize: 11, fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: acima ? '#F0FDF4' : '#FEF2F2',
                    color: acima ? '#14532D' : '#991B1B',
                    border: `1.5px solid ${isMaisDistante ? '#DC2626' : isMaisForte && acima ? '#16A34A' : acima ? '#86EFAC' : '#FCA5A5'}`,
                  }}>
                    <span>{icon}</span>
                    <span>{s.label}</span>
                    <span style={{ opacity: 0.8 }}>{s.gap >= 0 ? '+' : ''}{s.gap.toFixed(2)}</span>
                  </div>
                )
              })}
            </div>

            {/* Mais forte / mais distante */}
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{
                flex: 1, background: '#F0FDF4', borderRadius: 10, padding: '8px 10px',
                border: '0.5px solid #86EFAC',
              }}>
                <div style={{ fontSize: 9, color: '#166534', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
                  {insights.maisForte.gap >= 0 ? '🔥 Mais forte' : '↑ Menos distante'}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#14532D' }}>
                  {insights.maisForte.label}
                </div>
                <div style={{ fontSize: 11, color: '#16A34A' }}>
                  {insights.maisForte.gap >= 0 ? '+' : ''}{insights.maisForte.gap.toFixed(2)} vs média ITA
                </div>
              </div>
              <div style={{
                flex: 1, background: '#FEF2F2', borderRadius: 10, padding: '8px 10px',
                border: '0.5px solid #FCA5A5',
              }}>
                <div style={{ fontSize: 9, color: '#991B1B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
                  ⚠ Mais distante
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#991B1B' }}>
                  {insights.maisDistante.label}
                </div>
                <div style={{ fontSize: 11, color: '#DC2626' }}>
                  {insights.maisDistante.gap.toFixed(2)} vs média ITA
                </div>
              </div>
            </div>
          </div>

          {/* Sugestão estratégica */}
          {insights.sugestao && (
            <div style={{
              borderRadius: 12, padding: '12px 14px',
              display: 'flex', gap: 10, alignItems: 'flex-start',
              background: insights.aprovado
                ? 'linear-gradient(135deg, #F0FDF4, #DCFCE7)'
                : insights.criticas.length > 0
                  ? '#FEF2F2'
                  : 'linear-gradient(135deg, #EFF6FF, #F5F3FF)',
              border: `1px solid ${insights.aprovado ? '#86EFAC' : insights.criticas.length > 0 ? '#FCA5A5' : '#C4B5FD'}`,
            }}>
              <div style={{ fontSize: 18, flexShrink: 0 }}>
                {insights.aprovado ? '🏆' : insights.criticas.length > 0 ? '🚨' : '🎯'}
              </div>
              <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.65 }}>
                {insights.sugestao}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tabela principal ─────────────────────────────────────────── */}
      <div style={{
        background: 'white', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)',
        overflow: 'hidden', marginBottom: 16,
      }}>
        <div style={{ padding: '14px 16px', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Comparativo por ciclo × ITA {anoITA}</div>
          <div style={{ fontSize: 11, color: '#888' }}>
            Ampla Concorrência — referência: aprovados reais {anoITA}
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#555',
                  borderBottom: '0.5px solid rgba(0,0,0,0.08)', whiteSpace: 'nowrap', minWidth: 90 }}>
                  Ciclo
                </th>
                {CAMPOS.map(c => (
                  <th key={c.campo} style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600, color: '#555',
                    borderBottom: '0.5px solid rgba(0,0,0,0.08)', whiteSpace: 'nowrap', minWidth: 80 }}>
                    {c.label}
                  </th>
                ))}
                <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600,
                  color: anoITA === 2024 ? '#1e40af' : '#166534',
                  background: anoITA === 2024 ? '#EFF6FF' : '#F0FDF4',
                  borderBottom: '0.5px solid rgba(0,0,0,0.08)', whiteSpace: 'nowrap', minWidth: 96 }}>
                  ITA {anoITA}?
                </th>
              </tr>

              {/* Linha de referência ITA do ano selecionado */}
              <tr style={{ background: anoITA === 2024 ? '#EFF6FF' : '#F0FDF4' }}>
                <td style={{ padding: '5px 12px', fontSize: 10, fontWeight: 600,
                  color: anoITA === 2024 ? '#1e40af' : '#166534',
                  borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
                  Média ITA {anoITA}
                </td>
                {CAMPOS.map(c => (
                  <td key={c.campo} style={{ padding: '5px 10px', textAlign: 'center',
                    fontSize: 11, fontWeight: 600,
                    color: anoITA === 2024 ? '#1e40af' : '#166534',
                    borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
                    {(ITA[anoITA][c.refKey as RefKey] as number).toFixed(2)}
                  </td>
                ))}
                <td style={{
                  padding: '5px 10px', textAlign: 'center', fontSize: 10,
                  color: '#888', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
                  corte {ITA[anoITA].corte}
                </td>
              </tr>

              {/* Linha Piso — menor nota de um aprovado (2024+2025 Ampla) */}
              <tr style={{ background: '#FFF7ED' }}>
                <td style={{ padding: '5px 12px', fontSize: 10, fontWeight: 600,
                  color: '#92400E', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
                  Piso ¹
                </td>
                {CAMPOS.map(c => (
                  <td key={c.campo} style={{ padding: '5px 10px', textAlign: 'center',
                    fontSize: 10, color: '#B45309',
                    borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
                    {(PISO[c.refKey] ?? 0).toFixed(2)}
                  </td>
                ))}
                <td style={{
                  padding: '5px 10px', textAlign: 'center', fontSize: 9,
                  color: '#aaa', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
                  —
                </td>
              </tr>
            </thead>

            <tbody>
              {ciclos.map((r, i) => {
                const notaFinal = mediaFinalITA(r)
                const aprovado = notaFinal !== null ? notaFinal >= ITA[anoITA].corte : null

                return (
                  <tr key={r.ciclo_nome || i}
                    style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#FAFAFA')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '9px 12px', fontWeight: 600, color: '#222',
                      whiteSpace: 'nowrap', fontSize: 11 }}>
                      {r.ciclo_nome?.replace('Ciclo ', 'C').replace(' - ITA', '')}
                    </td>

                    {CAMPOS.map(c => {
                      // Para "Nota Final": calcula via fórmula ITA (não usa campo media_2fase do banco)
                      const val = c.campo === 'media_2fase'
                        ? notaFinal
                        : (r[c.campo] !== null && r[c.campo] !== undefined ? Number(r[c.campo]) : null)
                      const ref = ITA[anoITA][c.refKey as RefKey] as number
                      const bg = val !== null ? corCelula(val, ref) : 'transparent'
                      const textCor = val !== null ? corValor(val, ref) : '#ccc'

                      return (
                        <td key={c.campo} style={{ padding: '9px 10px', textAlign: 'center', background: bg }}>
                          {val !== null ? (
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: textCor }}>
                                {val.toFixed(c.campo === 'media_1fase' ? 4 : c.campo === 'media_2fase' ? 4 : 2)}
                              </div>
                              <div style={{ fontSize: 9, color: '#999', marginTop: 1 }}>
                                {delta(val, ref)}
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: '#ddd', fontSize: 12 }}>—</span>
                          )}
                        </td>
                      )
                    })}

                    {/* Seria aprovado? (baseado na nota final ITA: 20% cada componente) */}
                    <td style={{
                      padding: '9px 10px', textAlign: 'center',
                      background: anoITA === 2024 ? '#F8FBFF' : '#F8FFF8',
                    }}>
                      {aprovado === null ? (
                        <span style={{ color: '#ccc', fontSize: 12 }}>—</span>
                      ) : aprovado ? (
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: '#16A34A' }}>✓</div>
                          <div style={{ fontSize: 9, color: '#16A34A' }}>+{(notaFinal! - ITA[anoITA].corte).toFixed(4)}</div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: '#DC2626' }}>✗</div>
                          <div style={{ fontSize: 9, color: '#DC2626' }}>{(notaFinal! - ITA[anoITA].corte).toFixed(4)}</div>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Legenda */}
        <div style={{ padding: '10px 16px', borderTop: '0.5px solid rgba(0,0,0,0.06)',
          display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 10, color: '#888' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: '#F0FDF4', border: '1px solid #86EFAC' }} />
            Acima da média dos aprovados ITA {anoITA}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: '#FEF2F2', border: '1px solid #FCA5A5' }} />
            Abaixo da média dos aprovados ITA {anoITA}
          </div>
          <div style={{ color: '#aaa', marginLeft: 4 }}>▵ = delta vs média ITA {anoITA}</div>
          <div style={{ color: '#B45309', marginLeft: 4 }}>¹ Piso = menor nota observada entre os aprovados (2024+2025)</div>
        </div>
      </div>

      {/* ── Ponto Fraco Estratégico ───────────────────────────────────── */}
      <div style={{ background: 'white', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)', padding: '16px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Ponto Fraco Estratégico</div>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 14 }}>
          Sua média geral nos simulados vs. piso e média dos aprovados no ITA {anoITA}
        </div>

        {pontoFraco.map(m => {
          const pct = Math.min(((m.valor ?? 0) / 10) * 100, 100)
          const pctPiso = (m.min / 10) * 100
          const pctMedia = (m.avg / 10) * 100
          const abaixoPiso = (m.gapPiso ?? 0) < 0
          const abaixoMedia = (m.gapMedia ?? 0) < 0

          return (
            <div key={m.campo} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>{m.label}</span>
                <div style={{ display: 'flex', gap: 10, fontSize: 11 }}>
                  <span style={{ color: abaixoMedia ? '#DC2626' : '#16A34A', fontWeight: 700 }}>
                    Você: {(m.valor ?? 0).toFixed(2)}
                  </span>
                  <span style={{ color: '#888' }}>média {m.avg.toFixed(2)} · piso {m.min.toFixed(2)}</span>
                </div>
              </div>

              {/* Barra com marcadores */}
              <div style={{ position: 'relative', height: 10, background: '#F1F5F9', borderRadius: 6, overflow: 'visible' }}>
                {/* Barra do aluno */}
                <div style={{
                  position: 'absolute', left: 0, top: 0, height: '100%',
                  width: `${pct}%`, borderRadius: 6,
                  background: abaixoPiso ? '#EF4444' : abaixoMedia ? '#F59E0B' : '#22C55E',
                  transition: 'width 0.4s',
                }} />
                {/* Linha do piso */}
                <div style={{
                  position: 'absolute', left: `${pctPiso}%`, top: -3, bottom: -3,
                  width: 2, background: '#DC2626', borderRadius: 1,
                }} />
                {/* Linha da média */}
                <div style={{
                  position: 'absolute', left: `${pctMedia}%`, top: -3, bottom: -3,
                  width: 2, background: '#D97706', borderRadius: 1,
                }} />
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 10, color: '#999' }}>
                <span style={{ color: '#DC2626' }}>⎮ piso {m.min.toFixed(2)}</span>
                <span style={{ color: '#D97706' }}>⎮ média {m.avg.toFixed(2)}</span>
                {abaixoPiso && (
                  <span style={{ color: '#DC2626', fontWeight: 700, marginLeft: 'auto' }}>
                    ⚠ {m.gapPiso!.toFixed(2)} abaixo do piso
                  </span>
                )}
              </div>
            </div>
          )
        })}

        {pontoFraco.length > 0 && (() => {
          const piorMateria = pontoFraco[0]
          const abaixoPiso = (piorMateria.gapPiso ?? 0) < 0
          return (
            <div style={{
              background: abaixoPiso ? '#FEF2F2' : '#FFFBEB',
              border: `1px solid ${abaixoPiso ? '#FCA5A5' : '#FCD34D'}`,
              borderRadius: 10, padding: '10px 14px', marginTop: 4,
              fontSize: 12, color: '#374151', lineHeight: 1.6,
            }}>
              {abaixoPiso ? (
                <>
                  <strong>🎯 Prioridade máxima: {piorMateria.label}</strong> está abaixo do
                  mínimo observado entre os aprovados no ITA {anoITA}. Ganhar{' '}
                  <strong>{Math.abs(piorMateria.gapPiso!).toFixed(2)} pontos</strong> nessa matéria
                  é o primeiro passo para entrar na zona competitiva.
                </>
              ) : (
                <>
                  Todas as matérias estão acima do piso dos aprovados.{' '}
                  <strong>{piorMateria.label}</strong> é a que mais distância tem da média
                  ({piorMateria.gapMedia!.toFixed(2)}). Foque aqui para maximizar a média final.
                </>
              )}
            </div>
          )
        })()}

        <div style={{ fontSize: 10, color: '#aaa', marginTop: 12, lineHeight: 1.5 }}>
          * Comparação com Ampla Concorrência {anoITA}. Os dados do aluno são simulados internos —
          a comparação é direcional, não uma previsão exata.
        </div>
      </div>
    </div>
  )
}
