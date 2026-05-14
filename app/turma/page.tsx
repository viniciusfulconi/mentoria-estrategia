'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Nav from '@/components/Nav'
import Link from 'next/link'

export default function Turma() {
  const [dados, setDados] = useState<any[]>([])
  const [cicloAtivo, setCicloAtivo] = useState<string>('')
  const [ciclos, setCiclos] = useState<string[]>([])
  const [aba, setAba] = useState<'ranking' | 'atencao' | 'destaques' | 'mentor'>('ranking')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Busca todos os resultados — inclui ciclos sem ranking
    supabase.from('resultados').select('*').eq('fase', 'ranking').order('ciclo_nome')
      .then(({ data }) => {
        const d = data || []
        setDados(d)
        const cs = [...new Set(d.map((r: any) => r.ciclo_nome))].sort() as string[]
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
  function top3(campo: string) {
    return [...cicloData].filter(r => r[campo] !== null)
      .sort((a, b) => Number(b[campo]) - Number(a[campo])).slice(0, 3)
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
    return n >= 7 ? '#1D9E75' : n >= 5 ? '#EF9F27' : '#E24B4A'
  }

  const abas = [
    { id: 'ranking', label: 'Ranking' },
    { id: 'atencao', label: `⚠ Atenção (${atencao.length})` },
    { id: 'destaques', label: 'Destaques' },
    { id: 'mentor', label: 'Por mentor' },
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
            background: cicloAtivo === c ? '#534AB7' : 'transparent',
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
            background: aba === a.id ? '#1a1a1a' : '#F1EFE8',
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
                ? (media >= 5 ? '#1D9E75' : '#E24B4A')
                : (r.resultado_ciclo === 'Aprovado' ? '#1D9E75' : '#E24B4A')
              const posicao = cicloAtivo === 'geral' ? i + 1 : (r.classificacao || i + 1)
              return (
                <Link key={r.id_aluno} href={`/aluno/${r.id_aluno}`} style={{ textDecoration: 'none' }}>
                  <div className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: i < 3 ? '#EEEDFE' : '#F1EFE8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: i < 3 ? '#534AB7' : '#888', flexShrink: 0 }}>
                      {posicao}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a' }}>{r.nome_aluno}</div>
                      <div style={{ fontSize: 10, color: '#999' }}>{r.mentor}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: cor }}>{media.toFixed(1)}</div>
                      <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: r.resultado_ciclo === 'Aprovado' ? '#EAF3DE' : '#FCEBEB', color: r.resultado_ciclo === 'Aprovado' ? '#27500A' : '#791F1F' }}>
                        {r.resultado_ciclo === 'Aprovado' ? '✓' : '✗'}
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
                  <div className="card" style={{ marginBottom: 10, borderLeft: '3px solid #E24B4A' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{r.nome_aluno}</div>
                    <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>Mentor: {r.mentor}</div>
                    {r.motivo_reprovacao && <div style={{ fontSize: 11, color: '#E24B4A' }}>✗ {r.motivo_reprovacao}</div>}
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
                  { label: '🏆 Top Matemática', campo: 'nota_matematica' },
                  { label: '⚡ Top Física', campo: 'nota_fisica' },
                  { label: '🧪 Top Química', campo: 'nota_quimica' },
                  { label: '📝 Top Linguagens', campo: 'media_linguagens' },
                  { label: '🎯 Top 1ª Fase', campo: 'media_1fase' },
                ].map(({ label, campo }) => {
                  const top = top3(campo)
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
                        {reprovados > 0 && <div style={{ fontSize: 10, color: '#E24B4A' }}>⚠ {reprovados} reprov.</div>}
                      </div>
                    </div>
                    {alunos.map((a: any, i: number) => {
                      const m = cicloAtivo === 'geral' ? (a._mediaGeral || 0) : mediaAluno(a)
                      return (
                        <Link key={a.id} href={`/aluno/${a.id_aluno}`} style={{ textDecoration: 'none' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderTop: i === 0 ? '0.5px solid rgba(0,0,0,0.06)' : 'none', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
                            <span style={{ fontSize: 11, color: '#999', minWidth: 20 }}>#{i + 1}</span>
                            <span style={{ flex: 1, fontSize: 12 }}>{a.nome_aluno}</span>
                            <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 6, background: a.resultado_ciclo === 'Aprovado' ? '#EAF3DE' : '#FCEBEB', color: a.resultado_ciclo === 'Aprovado' ? '#27500A' : '#791F1F' }}>
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
