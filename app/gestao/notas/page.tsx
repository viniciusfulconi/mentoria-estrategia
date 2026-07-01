'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { dbQueryAll } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import Nav from '@/components/Nav'
import PageLoader from '@/components/PageLoader'
import { FASES, notaDeQuestoes, salvarNotasAluno } from '@/lib/notas'

type Concurso = 'ITA' | 'IME'

function corNota(n: number | null) {
  if (n === null) return '#999'
  return n >= 7 ? '#16A34A' : n >= 4 ? '#D97706' : '#DC2626'
}
function parseVal(s: string): number | null {
  const t = (s ?? '').trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t); return Number.isFinite(n) ? n : null
}
function parseQ(s: string): number {
  const t = (s ?? '').trim().replace(',', '.')
  if (t === '') return 0
  const n = Number(t); return Number.isFinite(n) ? n : 0
}
function fmt(n: any): string {
  if (n === null || n === undefined || n === '') return ''
  return String(n)
}
function ordQ(keys: string[]): string[] {
  return [...keys].sort((a, b) => (parseInt(a.replace(/\D/g, '')) || 0) - (parseInt(b.replace(/\D/g, '')) || 0))
}

export default function GestaoNotas() {
  const { perfil, loading } = useAuth()
  const router = useRouter()
  const isGestor = perfil?.papel === 'coordenador' || perfil?.papel === 'direcao'

  const [concurso, setConcurso] = useState<Concurso>('ITA')
  const [ciclo, setCiclo] = useState<string>('')
  const [rankingRows, setRankingRows] = useState<any[]>([])
  const [carregandoLista, setCarregandoLista] = useState(false)
  const [busca, setBusca] = useState('')

  const [alunoSel, setAlunoSel] = useState<any | null>(null)
  const [carregandoEditor, setCarregandoEditor] = useState(false)
  const [linhasAluno, setLinhasAluno] = useState<any[]>([])
  // fase → 'questoes' | 'valor' (modo de edição daquela fase)
  const [modoFase, setModoFase] = useState<Record<string, 'questoes' | 'valor'>>({})
  // estado editável
  const [questoes, setQuestoes] = useState<Record<string, Record<string, string>>>({})
  const [valores, setValores] = useState<Record<string, string>>({})
  const [orig, setOrig] = useState<{ q: string; v: string }>({ q: '{}', v: '{}' })

  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  useEffect(() => { if (!loading && perfil && !isGestor) router.replace('/') }, [loading, perfil, isGestor, router])

  useEffect(() => {
    if (!isGestor) return
    setCarregandoLista(true); setAlunoSel(null)
    dbQueryAll('resultados', { fase: 'eq.ranking', concurso: `eq.${concurso}`, order: 'ciclo_nome,classificacao' })
      .then(({ data }) => {
        const rows = data || []
        setRankingRows(rows)
        const cs = [...new Set(rows.map((r: any) => r.ciclo_nome))]
        setCiclo(prev => (prev && cs.includes(prev)) ? prev : (cs[0] || ''))
      })
      .finally(() => setCarregandoLista(false))
  }, [concurso, isGestor])

  const ciclos = useMemo(() => [...new Set(rankingRows.map(r => r.ciclo_nome))], [rankingRows])
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return rankingRows
      .filter(r => r.ciclo_nome === ciclo)
      .filter(r => !q || (r.nome_aluno || '').toLowerCase().includes(q))
      .sort((a, b) => (a.classificacao ?? 999) - (b.classificacao ?? 999))
  }, [rankingRows, ciclo, busca])

  async function selecionarAluno(rankRow: any) {
    // Limpa o editor ANTES do fetch para nunca exibir dados do aluno anterior
    // sob o novo nome (evita editar o aluno errado durante o carregamento).
    setMsg(null); setAlunoSel(rankRow); setCarregandoEditor(true)
    setQuestoes({}); setValores({}); setModoFase({}); setLinhasAluno([])
    const { data } = await dbQueryAll('resultados', {
      id_aluno: `eq.${rankRow.id_aluno}`, ciclo_nome: `eq.${ciclo}`, concurso: `eq.${concurso}`,
    })
    const linhas = data || []
    setLinhasAluno(linhas)

    const modo: Record<string, 'questoes' | 'valor'> = {}
    const q: Record<string, Record<string, string>> = {}
    const v: Record<string, string> = {}
    for (const cfg of FASES) {
      const row = linhas.find((l: any) => l.fase === cfg.fase)
      const temQ = cfg.questoes && row?.notas_questoes && Object.keys(row.notas_questoes).length > 0
      if (temQ) {
        modo[cfg.fase] = 'questoes'
        const m: Record<string, string> = {}
        for (const k of Object.keys(row.notas_questoes)) m[k] = fmt(row.notas_questoes[k])
        q[cfg.fase] = m
      } else {
        modo[cfg.fase] = 'valor'
        v[cfg.campoAgg] = fmt(row ? row[cfg.campoAgg] : '')
      }
    }
    // Redação (sempre valor direto, na linha de português)
    const portRow = linhas.find((l: any) => l.fase === '2fase_port')
    v['nota_redacao'] = fmt(portRow ? portRow.nota_redacao : '')

    setModoFase(modo); setQuestoes(q); setValores(v)
    setOrig({ q: JSON.stringify(q), v: JSON.stringify(v) })
    setCarregandoEditor(false)
  }

  function notaFase(fase: string): number | null {
    const m = questoes[fase]; if (!m) return null
    const nums: Record<string, number> = {}
    for (const k of Object.keys(m)) nums[k] = parseQ(m[k])
    return notaDeQuestoes(nums)
  }
  const linguagens = useMemo(() => {
    const port = modoFase['2fase_port'] === 'questoes' ? notaFase('2fase_port') : parseVal(valores['nota_portugues'])
    const red = parseVal(valores['nota_redacao'])
    if (port == null && red == null) return null
    if (port == null || red == null) return (port ?? red)
    return Math.round(((port + red) / 2) * 10000) / 10000
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questoes, valores, modoFase])

  async function salvar() {
    if (!alunoSel) return
    const mudouQ = JSON.stringify(questoes) !== orig.q
    const mudouV = JSON.stringify(valores) !== orig.v
    if (!mudouQ && !mudouV) { setMsg({ tipo: 'ok', texto: 'Nenhuma alteração para salvar.' }); return }

    const origQ = JSON.parse(orig.q), origV = JSON.parse(orig.v)
    const questoesPorFase: Record<string, Record<string, number>> = {}
    for (const fase of Object.keys(questoes)) {
      if (JSON.stringify(questoes[fase]) !== JSON.stringify(origQ[fase])) {
        const m: Record<string, number> = {}
        for (const k of Object.keys(questoes[fase])) m[k] = parseQ(questoes[fase][k])
        questoesPorFase[fase] = m
      }
    }
    const valoresMud: Record<string, number | null> = {}
    for (const col of Object.keys(valores)) {
      if (valores[col] !== origV[col]) valoresMud[col] = parseVal(valores[col])
    }

    setSalvando(true); setMsg(null)
    try {
      await salvarNotasAluno({
        ciclo, concurso, linhasAluno, questoesPorFase, valores: valoresMud,
      })
      const { data } = await dbQueryAll('resultados', { fase: 'eq.ranking', concurso: `eq.${concurso}`, order: 'ciclo_nome,classificacao' })
      const rows = data || []
      setRankingRows(rows)
      const novo = rows.find((r: any) => r.id_aluno === alunoSel.id_aluno && r.ciclo_nome === ciclo)
      if (novo) await selecionarAluno(novo)
      setMsg({ tipo: 'ok', texto: 'Notas salvas, detalhamento atualizado e ranking recalculado.' })
    } catch (e: any) {
      setMsg({ tipo: 'erro', texto: e.message || 'Erro ao salvar.' })
    } finally { setSalvando(false) }
  }

  if (loading) return (<><Nav /><PageLoader /></>)
  if (!isGestor) return (<><Nav /><div style={{ padding: 40, textAlign: 'center', color: '#999' }}>Acesso restrito.</div></>)

  return (
    <>
      <Nav />
      <div style={{ paddingBottom: 80 }}>
        <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: 16, position: 'sticky', top: 0, zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 600 }}>Gestão de notas</div>
          <span style={{ fontSize: 12, color: '#999' }}>{lista.length} alunos</span>
        </div>

        <div style={{ display: 'flex', gap: 6, padding: '10px 16px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
          {(['ITA', 'IME'] as Concurso[]).map(c => (
            <button key={c} onClick={() => setConcurso(c)} style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 12, border: '0.5px solid rgba(0,0,0,0.12)',
              background: concurso === c ? '#1a1a1a' : 'transparent', color: concurso === c ? 'white' : '#666', cursor: 'pointer', fontWeight: 600,
            }}>{c}</button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '10px 16px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
          {ciclos.map(c => (
            <button key={c} onClick={() => { setCiclo(c); setAlunoSel(null) }} style={{
              padding: '5px 12px', borderRadius: 20, fontSize: 11, border: '0.5px solid rgba(0,0,0,0.12)',
              background: ciclo === c ? '#f97316' : 'transparent', color: ciclo === c ? 'white' : '#666', cursor: 'pointer', whiteSpace: 'nowrap',
            }}>{c.replace('Ciclo ', 'C')}</button>
          ))}
        </div>

        <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'minmax(0,0.8fr) minmax(0,1.4fr)', gap: 16, alignItems: 'start' }}>
          {/* Lista */}
          <div className="card" style={{ padding: 12 }}>
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar aluno…"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 14, marginBottom: 10 }} />
            {carregandoLista ? <div style={{ textAlign: 'center', color: '#999', padding: 24 }}>Carregando…</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 520, overflowY: 'auto' }}>
                {lista.map(r => (
                  <button key={r.id} onClick={() => selecionarAluno(r)} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8,
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                    background: alunoSel?.id_aluno === r.id_aluno ? 'rgba(249,115,22,0.12)' : 'transparent',
                  }}>
                    <span style={{ fontSize: 13, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ color: '#999', marginRight: 6 }}>#{r.classificacao ?? '—'}</span>{r.nome_aluno}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: corNota(r.media_2fase ?? null) }}>
                      {r.media_2fase != null ? Number(r.media_2fase).toFixed(2) : '—'}
                    </span>
                  </button>
                ))}
                {lista.length === 0 && <div style={{ textAlign: 'center', color: '#999', padding: 24 }}>Nenhum aluno.</div>}
              </div>
            )}
          </div>

          {/* Editor */}
          <div className="card" style={{ padding: 16 }}>
            {!alunoSel ? <div style={{ color: '#999', textAlign: 'center', padding: 40 }}>Selecione um aluno para editar as notas.</div> : carregandoEditor ? <div style={{ color: '#999', textAlign: 'center', padding: 40 }}>Carregando notas…</div> : (
              <>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>{alunoSel.nome_aluno}</div>
                <div style={{ fontSize: 12, color: '#999', marginBottom: 16 }}>
                  {ciclo} · {concurso} · posição #{alunoSel.classificacao ?? '—'} · resultado: {alunoSel.resultado_ciclo ?? '—'}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {FASES.map(cfg => {
                    const emQuestoes = modoFase[cfg.fase] === 'questoes'
                    const nota = emQuestoes ? notaFase(cfg.fase) : parseVal(valores[cfg.campoAgg])
                    return (
                      <div key={cfg.fase} style={{ borderTop: '0.5px solid rgba(0,0,0,0.06)', paddingTop: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{cfg.label}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: corNota(nota) }}>
                            {nota != null ? nota.toFixed(2) : '—'}
                            {emQuestoes && <span style={{ fontSize: 10, color: '#aaa', fontWeight: 400 }}> (das questões)</span>}
                          </span>
                        </div>

                        {emQuestoes ? (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(58px, 1fr))', gap: 6 }}>
                            {ordQ(Object.keys(questoes[cfg.fase] || {})).map(qk => {
                              const mudou = (() => { try { return questoes[cfg.fase]?.[qk] !== JSON.parse(orig.q)[cfg.fase]?.[qk] } catch { return false } })()
                              return (
                                <label key={qk} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                  <span style={{ fontSize: 10, color: '#999', textAlign: 'center' }}>{qk}</span>
                                  <input inputMode="decimal" value={questoes[cfg.fase][qk] ?? ''}
                                    onChange={e => setQuestoes(p => ({ ...p, [cfg.fase]: { ...p[cfg.fase], [qk]: e.target.value } }))}
                                    style={{ width: '100%', padding: '5px 4px', textAlign: 'center', fontSize: 13, borderRadius: 6,
                                      border: mudou ? '1px solid #f97316' : '0.5px solid rgba(0,0,0,0.15)' }} />
                                </label>
                              )
                            })}
                          </div>
                        ) : (
                          <input inputMode="decimal" value={valores[cfg.campoAgg] ?? ''} placeholder="—"
                            onChange={e => setValores(p => ({ ...p, [cfg.campoAgg]: e.target.value }))}
                            style={{ width: 110, padding: '7px 10px', fontSize: 14, borderRadius: 8,
                              border: valores[cfg.campoAgg] !== (() => { try { return JSON.parse(orig.v)[cfg.campoAgg] } catch { return '' } })() ? '1px solid #f97316' : '0.5px solid rgba(0,0,0,0.15)' }} />
                        )}

                        {/* Redação + média de linguagens, logo após Português */}
                        {cfg.fase === '2fase_port' && (
                          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginTop: 10 }}>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontSize: 11, color: '#666' }}>Redação</span>
                              <input inputMode="decimal" value={valores['nota_redacao'] ?? ''} placeholder="—"
                                onChange={e => setValores(p => ({ ...p, nota_redacao: e.target.value }))}
                                style={{ width: 90, padding: '6px 10px', fontSize: 14, borderRadius: 8,
                                  border: valores['nota_redacao'] !== (() => { try { return JSON.parse(orig.v)['nota_redacao'] } catch { return '' } })() ? '1px solid #f97316' : '0.5px solid rgba(0,0,0,0.15)' }} />
                            </label>
                            <div style={{ fontSize: 12, color: '#666' }}>
                              Média linguagens: <b style={{ color: corNota(linguagens) }}>{linguagens != null ? linguagens.toFixed(2) : '—'}</b>
                              <span style={{ color: '#aaa' }}> = (port + redação) / 2</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div style={{ fontSize: 11, color: '#999', marginTop: 14 }}>
                  Nas fases com questões, edite a questão — a nota bruta e o gráfico radar são recalculados juntos. Ao salvar, o ranking do ciclo é recalculado.
                </div>
                {msg && <div style={{ marginTop: 12, fontSize: 13, color: msg.tipo === 'ok' ? '#16A34A' : '#DC2626' }}>{msg.texto}</div>}

                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button onClick={salvar} disabled={salvando} style={{
                    padding: '10px 20px', borderRadius: 8, border: 'none', cursor: salvando ? 'default' : 'pointer',
                    background: salvando ? '#ccc' : '#f97316', color: 'white', fontWeight: 600, fontSize: 14,
                  }}>{salvando ? 'Salvando e recalculando…' : 'Salvar e recalcular ranking'}</button>
                  <button onClick={() => { const o = JSON.parse(orig.q), ov = JSON.parse(orig.v); setQuestoes(o); setValores(ov); setMsg(null) }} disabled={salvando} style={{
                    padding: '10px 16px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', cursor: 'pointer', background: 'transparent', color: '#666', fontSize: 14,
                  }}>Desfazer</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
