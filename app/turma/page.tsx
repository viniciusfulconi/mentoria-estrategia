'use client'
import { useEffect, useState, useMemo } from 'react'
import { dbQuery } from '@/lib/supabase'
import Nav from '@/components/Nav'
import PageLoader from '@/components/PageLoader'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'

const ITA_CORTE = { 2024: 7.1805, 2025: 7.2983 } as const
const ITA_AVG = {
  2024: { matematica: 7.90, fisica: 8.14, quimica: 7.29, portRed: 6.90, media2fase: 7.60 },
  2025: { matematica: 8.26, fisica: 7.55, quimica: 7.60, portRed: 6.98, media2fase: 7.68 },
} as const

// Nota final ITA = (1ª fase + mat + fís + quím + port) / 5  (20% cada)
function mediaFinalITA(r: any): number | null {
  const vals = [r.media_1fase, r.nota_matematica, r.nota_fisica, r.nota_quimica, r.media_linguagens]
    .map(v => (v !== null && v !== undefined && v !== '') ? Number(v) : null)
  if (vals.some(v => v === null)) return null
  return (vals as number[]).reduce((a, b) => a + b, 0) / 5
}

export default function Turma() {
  const { verticalAtiva } = useAuth()
  const router = useRouter()
  const [dados, setDados] = useState<any[]>([])
  const [cicloAtivo, setCicloAtivo] = useState<string>('')
  const [ciclos, setCiclos] = useState<string[]>([])
  const [aba, setAba] = useState<'ranking' | 'atencao' | 'destaques' | 'mentor' | 'termometro'>('ranking')
  const [anoITA, setAnoITA] = useState<2024 | 2025>(2025)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (verticalAtiva === 'Medicina') { router.replace('/med/alunos'); return }
    dbQuery('resultados', { fase: 'eq.ranking', order: 'ciclo_nome' })
      .then(({ data }) => {
        const d = data || []
        setDados(d)
        const cs = [...new Set(d.map((r: any) => r.ciclo_nome))].sort((a: string, b: string) =>
          (parseInt(a.match(/\d+/)?.[0] || '0') - parseInt(b.match(/\d+/)?.[0] || '0'))
        ) as string[]
        setCiclos(cs)
        if (cs.length) setCicloAtivo(cs[cs.length - 1])
        setLoading(false)
      })
  }, [])

  function mediaAluno(r: any): number {
    if (r._mediaGeral !== undefined) return r._mediaGeral
    const notas = [
      r.media_1fase,
      r.nota_matematica,
      r.nota_fisica,
      r.nota_quimica,
      r.media_linguagens,
    ].map(v => v !== null && v !== undefined ? Number(v) : null).filter(v => v !== null) as number[]
    if (!notas.length) return 0
    return notas.reduce((a, b) => a + b, 0) / notas.length
  }

  // Para o ranking geral: média de todos os ciclos por aluno
  const alunosGeralMap: Record<string, any> = {}
  dados.forEach(r => {
    if (!alunosGeralMap[r.id_aluno]) alunosGeralMap[r.id_aluno] = { ...r, _todasNotas: [] }
    const n = mediaAluno(r)
    if (n > 0) alunosGeralMap[r.id_aluno]._todasNotas.push(n)
  })
  const alunosGeral = Object.values(alunosGeralMap).map((r: any) => ({
    ...r,
    _mediaGeral: r._todasNotas.length ? r._todasNotas.reduce((a: number, b: number) => a + b, 0) / r._todasNotas.length : 0
  })).sort((a: any, b: any) => b._mediaGeral - a._mediaGeral)

  const cicloData = cicloAtivo === 'geral'
    ? alunosGeral
    : dados.filter(r => r.ciclo_nome === cicloAtivo).sort((a, b) => mediaAluno(b) - mediaAluno(a))

  // Alunos que precisam de atenção: reprovados ou média < 5
  const atencao = cicloData.filter(r =>
    r.resultado_ciclo === 'Reprovado' ||
    (r.media_2fase !== null && ((Number(r.media_1fase || 0) + Number(r.media_2fase || 0)) / 2) < 5) ||
    (r.media_2fase === null && Number(r.media_1fase || 0) < 5)
  )

  // Destaques por matéria (top 3 de cada)
  function top10(campo: string) {
    return [...cicloData].filter(r => r[campo] !== null)
      .sort((a, b) => Number(b[campo]) - Number(a[campo])).slice(0, 10)
  }

  // Por mentor — usa TODOS os ciclos para média geral
  const porMentor: Record<string, any[]> = {}

  if (cicloAtivo === 'geral') {
    // Média de todos os ciclos por aluno
    const alunosUnicos: Record<string, any> = {}
    dados.forEach(r => {
      if (!alunosUnicos[r.id_aluno]) alunosUnicos[r.id_aluno] = { ...r, _notas: [] }
      const nota = mediaAluno(r)
      if (nota > 0) alunosUnicos[r.id_aluno]._notas.push(nota)
    })
    Object.values(alunosUnicos).forEach((r: any) => {
      r._mediaGeral = r._notas.length ? r._notas.reduce((a: number, b: number) => a + b, 0) / r._notas.length : 0
      const m = r.mentor || 'Sem mentor'
      if (!porMentor[m]) porMentor[m] = []
      if (!porMentor[m].find((x: any) => x.id_aluno === r.id_aluno)) porMentor[m].push(r)
    })
    Object.keys(porMentor).forEach(m => {
      porMentor[m].sort((a: any, b: any) => b._mediaGeral - a._mediaGeral)
    })
  } else {
    // Dados do ciclo selecionado — já ordenados por mediaAluno
    cicloData.forEach((r: any) => {
      const m = r.mentor || 'Sem mentor'
      if (!porMentor[m]) porMentor[m] = []
      porMentor[m].push(r)
    })
    Object.keys(porMentor).forEach(m => {
      porMentor[m].sort((a: any, b: any) => mediaAluno(b) - mediaAluno(a))
    })
  }

  function mediaMentor(alunos: any[]) {
    const vals = alunos.map((r: any) => r._mediaGeral).filter((v: number) => v > 0)
    return vals.length ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : 0
  }

  function corNota(n: number) {
    return n >= 7 ? '#16A34A' : n >= 4 ? '#D97706' : '#DC2626'
  }

  const abas = [
    { id: 'ranking', label: 'Ranking' },
    { id: 'atencao', label: `⚠ Atenção (${atencao.length})` },
    { id: 'destaques', label: 'Destaques' },
    { id: 'mentor', label: 'Por mentor' },
    { id: 'termometro', label: '🌡 Termômetro' },
  ]

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Turma ITA</div>
        <span style={{ fontSize: 12, color: '#999' }}>{cicloData.length} alunos</span>
      </div>

      {/* Seletor ciclo */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '10px 16px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
        <button onClick={() => setCicloAtivo('geral')} style={{
          padding: '5px 12px', borderRadius: 20, fontSize: 11, border: '0.5px solid rgba(0,0,0,0.12)',
          background: cicloAtivo === 'geral' ? '#1a1a1a' : 'transparent',
          color: cicloAtivo === 'geral' ? 'white' : '#666',
          cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'DM Sans,sans-serif'
        }}>Geral</button>
        {ciclos.map(c => (
          <button key={c} onClick={() => setCicloAtivo(c)} style={{
            padding: '5px 12px', borderRadius: 20, fontSize: 11, border: '0.5px solid rgba(0,0,0,0.12)',
            background: cicloAtivo === c ? '#f97316' : 'transparent',
            color: cicloAtivo === c ? 'white' : '#666',
            cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'DM Sans,sans-serif'
          }}>
            {c.replace('Ciclo ', 'C').replace(' - ITA', '').replace(' - IME', '')}
          </button>
        ))}
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 4, overflowX: 'auto', padding: '8px 16px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
        {abas.map(a => (
          <button key={a.id} onClick={() => setAba(a.id as any)} style={{
            padding: '4px 12px', borderRadius: 16, fontSize: 11, border: 'none',
            background: aba === a.id ? '#1a1a1a' : '#F1F5F9',
            color: aba === a.id ? 'white' : '#666',
            cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'DM Sans,sans-serif'
          }}>{a.label}</button>
        ))}
      </div>

      <div style={{ padding: 16 }}>
        {loading ? <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>Carregando...</div> : (
          <>
            {/* RANKING */}
            {aba === 'ranking' && cicloData.map((r, i) => {
              const media = cicloAtivo === 'geral'
                ? (r._mediaGeral || 0)
                : mediaAluno(r)
              const cor = cicloAtivo === 'geral'
                ? (media >= 5 ? '#16A34A' : '#DC2626')
                : (r.resultado_ciclo === 'Aprovado' ? '#16A34A' : r.resultado_ciclo === 'Reprovado' ? '#DC2626' : '#D97706')
              const posicao = cicloAtivo === 'geral' ? i + 1 : (r.classificacao || i + 1)
              return (
                <Link key={r.id_aluno} href={`/aluno/${r.id_aluno}`} style={{ textDecoration: 'none' }}>
                  <div className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: i < 3 ? '#fff7ed' : '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: i < 3 ? '#f97316' : '#888', flexShrink: 0 }}>
                      {posicao}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a' }}>{r.nome_aluno}</div>
                      <div style={{ fontSize: 10, color: '#999' }}>{r.mentor}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: cor }}>{media.toFixed(1)}</div>
                      <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: r.resultado_ciclo === 'Aprovado' ? '#DCFCE7' : r.resultado_ciclo === 'Reprovado' ? '#FEF2F2' : '#FEF9C3', color: r.resultado_ciclo === 'Aprovado' ? '#14532D' : r.resultado_ciclo === 'Reprovado' ? '#991B1B' : '#713F12' }}>
                        {r.resultado_ciclo === 'Aprovado' ? '✓' : r.resultado_ciclo === 'Reprovado' ? '✗' : '⏳'}
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}

            {/* ATENÇÃO */}
            {aba === 'atencao' && (
              atencao.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                  <div>Nenhum aluno em situação crítica neste ciclo!</div>
                </div>
              ) : atencao.map(r => (
                <Link key={r.id} href={`/aluno/${r.id_aluno}`} style={{ textDecoration: 'none' }}>
                  <div className="card" style={{ marginBottom: 10, borderLeft: '3px solid #DC2626' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{r.nome_aluno}</div>
                    <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>Mentor: {r.mentor}</div>
                    {r.motivo_reprovacao && <div style={{ fontSize: 11, color: '#DC2626' }}>✗ {r.motivo_reprovacao}</div>}
                    <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 11 }}>
                      {r.media_1fase !== null && <span>1ª fase: <strong style={{ color: corNota(Number(r.media_1fase)) }}>{Number(r.media_1fase).toFixed(1)}</strong></span>}
                      {r.nota_matematica !== null && <span>Mat: <strong style={{ color: corNota(Number(r.nota_matematica)) }}>{Number(r.nota_matematica).toFixed(1)}</strong></span>}
                      {r.nota_fisica !== null && <span>Fís: <strong style={{ color: corNota(Number(r.nota_fisica)) }}>{Number(r.nota_fisica).toFixed(1)}</strong></span>}
                    </div>
                  </div>
                </Link>
              ))
            )}

            {/* DESTAQUES */}
            {aba === 'destaques' && (
              <div>
                {[
                  { label: '🏆 Top 10 Matemática', campo: 'nota_matematica' },
                  { label: '⚡ Top 10 Física', campo: 'nota_fisica' },
                  { label: '🧪 Top 10 Química', campo: 'nota_quimica' },
                  { label: '📝 Top 10 Linguagens', campo: 'media_linguagens' },
                  { label: '🎯 Top 10 — 1ª Fase', campo: 'media_1fase' },
                ].map(({ label, campo }) => {
                  const top = top10(campo)
                  if (!top.length) return null
                  return (
                    <div key={campo} className="card" style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>{label}</div>
                      {top.map((r, i) => (
                        <Link key={r.id} href={`/aluno/${r.id_aluno}`} style={{ textDecoration: 'none' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: i < top.length - 1 ? '0.5px solid rgba(0,0,0,0.06)' : 'none' }}>
                            <span style={{ fontSize: 14 }}>{['🥇', '🥈', '🥉'][i]}</span>
                            <span style={{ flex: 1, fontSize: 12, color: '#1a1a1a' }}>{r.nome_aluno}</span>
                            <span style={{ fontWeight: 600, fontSize: 13, color: corNota(Number(r[campo])) }}>{Number(r[campo]).toFixed(1)}</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}

            {/* TERMÔMETRO */}
            {aba === 'termometro' && (
              <div>
                {/* Seletor de ano */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  {([2024, 2025] as const).map(ano => (
                    <button key={ano} onClick={() => setAnoITA(ano)} style={{
                      padding: '6px 18px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                      border: 'none',
                      background: anoITA === ano ? '#f97316' : '#F1F5F9',
                      color: anoITA === ano ? 'white' : '#666',
                      cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
                    }}>ITA {ano}</button>
                  ))}
                </div>

                {cicloAtivo === 'geral' ? (
                  <div className="card" style={{ textAlign: 'center', padding: 32, color: '#999' }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>🌡</div>
                    <div>Selecione um ciclo específico para ver o Termômetro</div>
                  </div>
                ) : (String(cicloAtivo).toUpperCase().includes('IME') || cicloData.some((r: any) => String(r.concurso ?? '').toUpperCase() === 'IME')) ? (
                  <div className="card" style={{ textAlign: 'center', padding: 32, color: '#999' }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>🏛</div>
                    <div>Este é um ciclo do IME.</div>
                    <div style={{ fontSize: 11, marginTop: 6 }}>Em breve: Termômetro IME com estatísticas próprias.</div>
                  </div>
                ) : (
                  <>
                    {/* Card resumo */}
                    {(() => {
                      const comNotaFinal = cicloData.map(r => ({ r, mf: mediaFinalITA(r) })).filter(x => x.mf !== null)
                      const aprovados = comNotaFinal.filter(x => x.mf! >= ITA_CORTE[anoITA])
                      return (
                        <div className="card" style={{
                          marginBottom: 14,
                          background: aprovados.length > 0 ? '#F0FDF4' : '#FFF7ED',
                          borderLeft: `4px solid ${aprovados.length > 0 ? '#16A34A' : '#D97706'}`,
                        }}>
                          <div style={{ fontSize: 28, fontWeight: 700, color: aprovados.length > 0 ? '#14532D' : '#92400E' }}>
                            {aprovados.length}<span style={{ fontSize: 16, fontWeight: 400, color: '#666' }}>/{comNotaFinal.length}</span>
                          </div>
                          <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>
                            alunos seriam aprovados no ITA {anoITA}
                          </div>
                          <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                            Corte: {ITA_CORTE[anoITA].toFixed(4)} · Nota final = (1ª fase + mat + fís + quím + port) ÷ 5
                          </div>
                        </div>
                      )
                    })()}

                    {/* Referência ITA */}
                    <div style={{
                      fontSize: 11, color: '#f97316', fontWeight: 500,
                      marginBottom: 10, padding: '6px 10px',
                      background: '#fff7ed', borderRadius: 8, lineHeight: 1.6,
                    }}>
                      <strong>ITA {anoITA}</strong> — Mat: {ITA_AVG[anoITA].matematica.toFixed(2)} · Fís: {ITA_AVG[anoITA].fisica.toFixed(2)} · Quím: {ITA_AVG[anoITA].quimica.toFixed(2)} · Port/Red: {ITA_AVG[anoITA].portRed.toFixed(2)} · Nota final média: {ITA_AVG[anoITA].media2fase.toFixed(2)} · Corte: {ITA_CORTE[anoITA].toFixed(4)}
                    </div>

                    {/* Lista de alunos com nota final calculável */}
                    {[...cicloData]
                      .map(r => ({ r, notaFinal: mediaFinalITA(r) }))
                      .filter(x => x.notaFinal !== null)
                      .sort((a, b) => b.notaFinal! - a.notaFinal!)
                      .map(({ r, notaFinal }, i) => {
                        const mf = notaFinal!
                        const seriaAprovado = mf >= ITA_CORTE[anoITA]
                        const d = mf - ITA_CORTE[anoITA]
                        const subjects = [
                          { label: 'Mat', campo: 'nota_matematica', ref: ITA_AVG[anoITA].matematica },
                          { label: 'Fís', campo: 'nota_fisica',     ref: ITA_AVG[anoITA].fisica },
                          { label: 'Quím', campo: 'nota_quimica',   ref: ITA_AVG[anoITA].quimica },
                          { label: 'Port', campo: 'media_linguagens', ref: ITA_AVG[anoITA].portRed },
                        ]
                        return (
                          <Link key={r.id} href={`/aluno/${r.id_aluno}`} style={{ textDecoration: 'none' }}>
                            <div className="card" style={{
                              marginBottom: 8,
                              borderLeft: `3px solid ${seriaAprovado ? '#16A34A' : '#DC2626'}`,
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                                <div>
                                  <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a' }}>{r.nome_aluno}</div>
                                  <div style={{ fontSize: 10, color: '#999' }}>{r.mentor}</div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 17, fontWeight: 700, color: seriaAprovado ? '#16A34A' : '#DC2626' }}>
                                      {mf.toFixed(4)}
                                    </div>
                                    <div style={{ fontSize: 10, color: d >= 0 ? '#16A34A' : '#DC2626' }}>
                                      {d >= 0 ? '+' : ''}{d.toFixed(4)}
                                    </div>
                                  </div>
                                  <div style={{
                                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                                    background: seriaAprovado ? '#DCFCE7' : '#FEF2F2',
                                    color: seriaAprovado ? '#14532D' : '#991B1B',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 14, fontWeight: 700,
                                  }}>
                                    {seriaAprovado ? '✓' : '✗'}
                                  </div>
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                {subjects.map(({ label, campo, ref }) => {
                                  const val = r[campo] !== null && r[campo] !== undefined ? Number(r[campo]) : null
                                  if (val === null) return null
                                  const dv = val - ref
                                  return (
                                    <div key={campo} style={{
                                      background: dv >= 0 ? '#F0FDF4' : '#FEF2F2',
                                      borderRadius: 6, padding: '3px 7px', fontSize: 10,
                                    }}>
                                      <span style={{ color: '#666' }}>{label} </span>
                                      <span style={{ fontWeight: 600, color: dv >= 0 ? '#16A34A' : '#DC2626' }}>{val.toFixed(1)}</span>
                                      <span style={{ color: dv >= 0 ? '#16A34A' : '#DC2626', fontSize: 9, marginLeft: 2 }}>
                                        ({dv >= 0 ? '+' : ''}{dv.toFixed(1)})
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          </Link>
                        )
                      })}

                    {/* Alunos sem dados suficientes para calcular nota final */}
                    {cicloData.filter(r => mediaFinalITA(r) === null).length > 0 && (
                      <div style={{ fontSize: 11, color: '#aaa', textAlign: 'center', marginTop: 10 }}>
                        {cicloData.filter(r => mediaFinalITA(r) === null).length} aluno(s) sem todos os campos para calcular a nota final ITA
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* POR MENTOR */}
            {aba === 'mentor' && Object.entries(porMentor)
              .sort((a, b) => mediaMentor(b[1]) - mediaMentor(a[1]))
              .map(([mentor, alunos]) => {
                const media = mediaMentor(alunos)
                const reprovados = dados.filter(r => alunos.some((a: any) => a.id_aluno === r.id_aluno) && r.resultado_ciclo === 'Reprovado').length
                return (
                  <div key={mentor} className="card" style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{mentor}</div>
                        <div style={{ fontSize: 11, color: '#999' }}>{alunos.length} alunos</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 18, fontWeight: 600, color: corNota(media) }}>{media.toFixed(1)}</div>
                        {reprovados > 0 && <div style={{ fontSize: 10, color: '#DC2626' }}>⚠ {reprovados} reprov.</div>}
                      </div>
                    </div>
                    {alunos.map((a: any, i: number) => {
                      const m = cicloAtivo === 'geral' ? (a._mediaGeral || 0) : mediaAluno(a)
                      return (
                        <Link key={a.id} href={`/aluno/${a.id_aluno}`} style={{ textDecoration: 'none' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderTop: i === 0 ? '0.5px solid rgba(0,0,0,0.06)' : 'none', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
                            <span style={{ fontSize: 11, color: '#999', minWidth: 20 }}>#{i + 1}</span>
                            <span style={{ flex: 1, fontSize: 12 }}>{a.nome_aluno}</span>
                            <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 6, background: a.resultado_ciclo === 'Aprovado' ? '#DCFCE7' : '#FEF2F2', color: a.resultado_ciclo === 'Aprovado' ? '#14532D' : '#991B1B' }}>
                              {a.resultado_ciclo === 'Aprovado' ? '✓' : '✗'}
                            </span>
                            <span style={{ fontWeight: 600, fontSize: 12, color: corNota(m), minWidth: 30, textAlign: 'right' }}>{m.toFixed(1)}</span>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                )
              })
            }
          </>
        )}
      </div>
      <Nav />
    </div>
  )
}
