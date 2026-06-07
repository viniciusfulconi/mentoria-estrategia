'use client'
import { useEffect, useState, useMemo, useRef } from 'react'
import { dbQuery, dbUpdate, dbInsert, dbUpsert, dbDelete } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Nav from '@/components/Nav'
import { Upload, Save, Trash2 } from 'lucide-react'
import * as XLSX from 'xlsx'

type Questao = {
  id: string
  simulado_id: string
  fase: number
  dia: number
  numero: number
  materia: string
  tipo: 'objetiva' | 'dissertativa'
  alternativas: 'A-D' | 'A-E' | null
  pontuacao_max: number
  topico: string | null
  subtopico: string | null
  subsubtopico: string | null
  gabarito: string | null
  grupo: string | null
}

type TriScore = {
  aluno_id: string
  nome: string
  area_tri: string
  nota_tri: number
}

type TriAluno = {
  aluno_id: string
  nome: string
  LC: number; CH: number; CN: number; MT: number
  media: number
}

type Simulado = {
  id: string
  nome: string
  status: string
  turma_id: string | null
  turmas?: { nome: string }
  simulado_templates?: { nome: string; fases: any[]; tipo?: string }
}

type Tab = 'questoes' | 'gabarito' | 'resultados'

type ScoreAluno = {
  aluno_id: string
  nome: string
  total_pontos: number
  pontos_objetiva: number
  pontos_redacao: number
  total_respostas: number
}

type ScoreMateria = {
  aluno_id: string
  materia: string
  fase: number
  acertos: number
  total_questoes: number
}

export default function SimuladoDetalhe() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { perfil } = useAuth()
  const [simulado, setSimulado] = useState<Simulado | null>(null)
  const [questoes, setQuestoes] = useState<Questao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [tab, setTab] = useState<Tab>('questoes')

  // Gabarito state
  const [gabaritoMap, setGabaritoMap] = useState<Record<string, string>>({})
  const [topicosMap, setTopicosMap] = useState<Record<string, { topico: string; subtopico: string; subsubtopico: string }>>({})
  const [salvandoGabarito, setSalvandoGabarito] = useState(false)
  const [erroGabarito, setErroGabarito] = useState('')
  const [sucessoGabarito, setSucessoGabarito] = useState('')

  // Resultados state
  const [faseCSV, setFaseCSV] = useState(1)
  const [diaCSV, setDiaCSV] = useState(1)
  const [linhasCSV, setLinhasCSV] = useState<any[][]>([])
  const [salvandoResultados, setSalvandoResultados] = useState(false)
  const [erroResultados, setErroResultados] = useState('')
  const [sucessoResultados, setSucessoResultados] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [scores, setScores] = useState<ScoreAluno[]>([])
  const [scoresMat, setScoresMat] = useState<ScoreMateria[]>([])
  const [comRedacao, setComRedacao] = useState(false)
  const [grupoLinguagem, setGrupoLinguagem] = useState<'ingles' | 'espanhol'>('ingles')
  const [triScores, setTriScores] = useState<TriScore[]>([])
  const [modoRanking, setModoRanking] = useState<'bruto' | 'tri'>('bruto')

  useEffect(() => {
    if (perfil && perfil.papel !== 'coordenador' && perfil.papel !== 'direcao' && perfil.papel !== 'mentor') {
      router.replace('/'); return
    }
    carregar()
  }, [perfil, id])

  async function carregar() {
    setCarregando(true)
    const [{ data: s }, { data: q }, { data: sc }, { data: sm }] = await Promise.all([
      dbQuery<Simulado>('simulados_med', { id: `eq.${id}` }, '*,turmas(nome),simulado_templates(nome,fases,tipo)'),
      dbQuery<Questao>('simulado_questoes', { simulado_id: `eq.${id}`, order: 'fase.asc,dia.asc,numero.asc' }),
      dbQuery<ScoreAluno>('simulado_scores', { simulado_id: `eq.${id}`, order: 'total_pontos.desc' }),
      dbQuery<ScoreMateria>('simulado_scores_materia', { simulado_id: `eq.${id}` }),
    ])
    const sim = s?.[0] || null
    setSimulado(sim)
    const qs = q || []
    setQuestoes(qs)
    const map: Record<string, string> = {}
    const tm: Record<string, { topico: string; subtopico: string; subsubtopico: string }> = {}
    qs.forEach(q => {
      if (q.gabarito) map[q.id] = q.gabarito
      tm[q.id] = { topico: q.topico || '', subtopico: q.subtopico || '', subsubtopico: q.subsubtopico || '' }
    })
    setGabaritoMap(map)
    setTopicosMap(tm)
    setScores(sc || [])
    setScoresMat(sm || [])

    if (sim?.simulado_templates?.tipo === 'enem') {
      const { data: tri } = await dbQuery<TriScore>('enem_tri_area_scores', { simulado_id: `eq.${id}` })
      setTriScores(tri || [])
    }

    setCarregando(false)
  }

  // Agrupamento por fase/dia
  const grouped = useMemo(() => {
    const map: Record<string, Record<string, Questao[]>> = {}
    questoes.forEach(q => {
      const fk = String(q.fase)
      const dk = String(q.dia)
      if (!map[fk]) map[fk] = {}
      if (!map[fk][dk]) map[fk][dk] = []
      map[fk][dk].push(q)
    })
    return map
  }, [questoes])

  const fases = Object.keys(grouped).map(Number).sort((a, b) => a - b)

  // Dias e fases disponíveis para o CSV
  const diasDisponiveis = useMemo(() => {
    const fk = String(faseCSV)
    if (!grouped[fk]) return []
    return Object.keys(grouped[fk]).map(Number).sort((a, b) => a - b)
  }, [grouped, faseCSV])

  const isENEM = simulado?.simulado_templates?.tipo === 'enem'

  // Questões do dia selecionado para o CSV (filtra grupo bilíngue p/ ENEM Dia 1)
  const questoesDia = useMemo(() => {
    const fk = String(faseCSV), dk = String(diaCSV)
    let qs = (grouped[fk]?.[dk] || []) as Questao[]
    if (isENEM && faseCSV === 1 && diaCSV === 1) {
      qs = qs.filter(q => !q.grupo || q.grupo === grupoLinguagem)
    }
    return qs.sort((a, b) => a.numero - b.numero)
  }, [grouped, faseCSV, diaCSV, isENEM, grupoLinguagem])

  // ── Deletar ────────────────────────────────────────────────────────────────

  async function deletarSimulado() {
    if (!window.confirm(`Excluir "${simulado?.nome}"? Isso apaga questões, respostas e resultados permanentemente.`)) return
    await dbDelete('simulado_respostas', { simulado_id: `eq.${id}` })
    await dbDelete('simulado_questoes', { simulado_id: `eq.${id}` })
    await dbDelete('simulados_med', { id: `eq.${id}` })
    router.replace('/med/simulados')
  }

  // ── Gabarito ───────────────────────────────────────────────────────────────

  async function salvarGabarito() {
    setSalvandoGabarito(true); setErroGabarito(''); setSucessoGabarito('')
    let hasError = false
    const allQids = new Set([...Object.keys(gabaritoMap), ...Object.keys(topicosMap)])
    for (const qid of allQids) {
      const data: Record<string, any> = {}
      const gab = gabaritoMap[qid]
      if (gab) data.gabarito = gab.toUpperCase()
      const top = topicosMap[qid]
      if (top) {
        data.topico = top.topico || null
        data.subtopico = top.subtopico || null
        data.subsubtopico = top.subsubtopico || null
      }
      if (Object.keys(data).length === 0) continue
      const { error } = await dbUpdate('simulado_questoes', { id: `eq.${qid}` }, data)
      if (error) { setErroGabarito(error); hasError = true; break }
    }
    if (!hasError) {
      await dbUpdate('simulados_med', { id: `eq.${id}` }, { status: 'com_gabarito' })
      setSucessoGabarito('Gabarito salvo!')
      await carregar()
      setTimeout(() => setSucessoGabarito(''), 3000)
    }
    setSalvandoGabarito(false)
  }

  // ── Resultados CSV ─────────────────────────────────────────────────────────

  function processarCSV(file: File) {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })
        setLinhasCSV(rows.slice(1).filter(r => r[0] && r[1]))
        setErroResultados('')
      } catch { setErroResultados('Erro ao ler o arquivo. Use .csv ou .xlsx.') }
    }
    reader.readAsBinaryString(file)
  }

  async function importarResultados() {
    if (!linhasCSV.length) return
    if (questoesDia.length === 0) { setErroResultados('Nenhuma questão encontrada para este dia.'); return }

    const temGabarito = questoesDia.filter(q => q.tipo === 'objetiva').every(q => gabaritoMap[q.id] || q.gabarito)
    if (!temGabarito) { setErroResultados('Importe o gabarito das questões objetivas antes de importar resultados.'); return }

    setSalvandoResultados(true); setErroResultados(''); setSucessoResultados('')

    // Busca todos os alunos e faz o match por email em JS (sem filtro de turma — ENEM tem alunos de várias turmas)
    const { data: alunosData, error: alunosErr } = await dbQuery('alunos', { limit: '2000' }, 'id,email')
    if (alunosErr) { setErroResultados(`Erro ao buscar alunos: ${alunosErr}`); setSalvandoResultados(false); return }
    const emailToId: Record<string, string> = {}
    ;(alunosData || []).forEach((a: any) => { if (a.email) emailToId[a.email.toLowerCase()] = a.id })

    const respostas: any[] = []
    const erros: string[] = []

    linhasCSV.forEach((row, ri) => {
      const email = String(row[1]).trim().toLowerCase()
      const alunoId = emailToId[email]
      if (!alunoId) { erros.push(`Linha ${ri + 2}: aluno não encontrado (${email})`); return }

      questoesDia.forEach((q, qi) => {
        const respRaw = row[qi + 2]
        if (respRaw === undefined || respRaw === null || respRaw === '') return
        const resposta = String(respRaw).trim()

        let pontuacao = 0
        if (q.tipo === 'objetiva') {
          const gabarito = (gabaritoMap[q.id] || q.gabarito || '').toUpperCase()
          if (gabarito === 'ANULADA') {
            pontuacao = q.pontuacao_max
          } else {
            pontuacao = resposta.toUpperCase() === gabarito ? q.pontuacao_max : 0
          }
        } else {
          pontuacao = Math.min(Number(resposta) || 0, q.pontuacao_max)
        }

        respostas.push({
          simulado_id: id,
          aluno_id: alunoId,
          questao_id: q.id,
          resposta: resposta.toUpperCase(),
          pontuacao,
        })
      })
    })

    if (erros.length > 0) {
      setErroResultados(erros.join('\n'))
      setSalvandoResultados(false)
      return
    }

    if (respostas.length > 0) {
      const CHUNK = 300
      for (let i = 0; i < respostas.length; i += CHUNK) {
        const { error } = await dbUpsert('simulado_respostas', respostas.slice(i, i + CHUNK), 'simulado_id,aluno_id,questao_id')
        if (error) { setErroResultados(error); setSalvandoResultados(false); return }
      }
    }

    await dbUpdate('simulados_med', { id: `eq.${id}` }, { status: 'com_resultados' })
    setSucessoResultados(`${linhasCSV.length} aluno(s) importado(s) com sucesso!`)
    setLinhasCSV([])
    await carregar()
    setSalvandoResultados(false)
  }

  // ─────────────────────────────────────────────────────────────────────────

  const inp: React.CSSProperties = {
    padding: '8px 12px', borderRadius: 8,
    border: '1px solid rgba(0,0,0,0.12)', fontSize: 13,
    background: 'white', outline: 'none',
    fontFamily: 'DM Sans, sans-serif', color: '#1a1a1a',
  }

  if (carregando) return <div style={{ paddingBottom: 80 }}><Nav /><div style={{ textAlign: 'center', padding: 60, color: '#aaa', fontSize: 13 }}>Carregando...</div></div>
  if (!simulado) return <div style={{ paddingBottom: 80 }}><Nav /><div style={{ textAlign: 'center', padding: 60, color: '#aaa', fontSize: 13 }}>Simulado não encontrado.</div></div>

  const STATUS_SIM: Record<string, { label: string; bg: string; color: string }> = {
    criado:         { label: 'Criado',         bg: '#F1F5F9', color: '#475569' },
    com_gabarito:   { label: 'Com gabarito',   bg: '#DBEAFE', color: '#1e40af' },
    com_resultados: { label: 'Com resultados', bg: '#DCFCE7', color: '#166534' },
  }
  const scfg = STATUS_SIM[simulado.status] || STATUS_SIM.criado

  return (
    <div style={{ paddingBottom: 80 }}>
      <Nav />

      {/* Header */}
      <div style={{
        background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)',
        padding: '16px 20px', position: 'sticky', top: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa' }}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {simulado.nome}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 3, alignItems: 'center' }}>
            <span style={{ background: scfg.bg, color: scfg.color, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>
              {scfg.label}
            </span>
            {simulado.simulado_templates?.nome && <span style={{ fontSize: 11, color: '#999' }}>{simulado.simulado_templates.nome}</span>}
            {simulado.turmas?.nome && <span style={{ fontSize: 11, color: '#999' }}>{simulado.turmas.nome}</span>}
          </div>
        </div>
        <button
          onClick={deletarSimulado}
          title="Excluir simulado"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', padding: 8, borderRadius: 8, display: 'flex', alignItems: 'center' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
          onMouseLeave={e => (e.currentTarget.style.color = '#ccc')}
        >
          <Trash2 size={18} />
        </button>
      </div>

      {/* Tabs */}
      <div style={{ background: 'white', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', padding: '0 16px' }}>
          {([
            { id: 'questoes',   label: `Questões (${questoes.length})` },
            { id: 'gabarito',   label: 'Gabarito' },
            { id: 'resultados', label: 'Resultados' },
          ] as { id: Tab; label: string }[]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
              color: tab === t.id ? 'var(--purple)' : '#888',
              borderBottom: tab === t.id ? '2px solid var(--purple)' : '2px solid transparent',
              fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap',
            }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── QUESTÕES ── */}
      {tab === 'questoes' && (
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {fases.map(fi => (
            <div key={fi}>
              {fases.length > 1 && (
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: '#555' }}>Fase {fi}</div>
              )}
              {Object.keys(grouped[String(fi)]).map(Number).sort((a, b) => a - b).map(di => (
                <div key={di} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                    Dia {di}
                  </div>
                  <div style={{ border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 12, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC' }}>
                          {['Nº', 'Matéria', 'Tipo', 'Pts', 'Gabarito'].map(h => (
                            <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#666', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {grouped[String(fi)][String(di)].sort((a, b) => a.numero - b.numero).map(q => (
                          <tr key={q.id} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
                            <td style={{ padding: '7px 12px', color: '#888' }}>{q.numero}</td>
                            <td style={{ padding: '7px 12px', fontWeight: 500 }}>{q.materia}</td>
                            <td style={{ padding: '7px 12px', color: '#888' }}>
                              {q.tipo === 'objetiva' ? `Obj. ${q.alternativas || ''}` : 'Dis.'}
                            </td>
                            <td style={{ padding: '7px 12px', color: '#888' }}>{q.pontuacao_max}</td>
                            <td style={{ padding: '7px 12px' }}>
                              {q.gabarito
                                ? <span style={{ background: '#DCFCE7', color: '#166534', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8 }}>{q.gabarito}</span>
                                : q.tipo === 'objetiva'
                                  ? <span style={{ color: '#aaa', fontSize: 11 }}>—</span>
                                  : <span style={{ color: '#888', fontSize: 11 }}>Dis.</span>
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ── GABARITO ── */}
      {tab === 'gabarito' && (
        <div style={{ padding: '16px', maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {erroGabarito && <div style={{ background: '#FEF2F2', color: '#991B1B', fontSize: 13, padding: '10px 14px', borderRadius: 10 }}>{erroGabarito}</div>}
          {sucessoGabarito && <div style={{ background: '#F0FDF4', color: '#166534', fontSize: 13, padding: '10px 14px', borderRadius: 10 }}>{sucessoGabarito}</div>}

          {fases.map(fi => (
            <div key={fi}>
              {fases.length > 1 && (
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: '#555' }}>Fase {fi}</div>
              )}
              {Object.keys(grouped[String(fi)]).map(Number).sort((a, b) => a - b).map(di => {
                const objQuestoes = grouped[String(fi)][String(di)].filter(q => q.tipo === 'objetiva').sort((a, b) => a.numero - b.numero)
                if (objQuestoes.length === 0) return null
                return (
                  <div key={di} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                      Dia {di}
                    </div>
                    <div style={{ border: '0.5px solid rgba(0,0,0,0.10)', borderRadius: 12, overflow: 'hidden', background: 'white' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#F8FAFC' }}>
                            <th style={{ padding: '9px 14px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#666', borderBottom: '0.5px solid rgba(0,0,0,0.08)', width: 48 }}>Questão</th>
                            <th style={{ padding: '9px 14px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#666', borderBottom: '0.5px solid rgba(0,0,0,0.08)', width: 110 }}>Disciplina</th>
                            <th style={{ padding: '9px 14px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#666', borderBottom: '0.5px solid rgba(0,0,0,0.08)', width: 180 }}>Tópico</th>
                            <th style={{ padding: '9px 14px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#666', borderBottom: '0.5px solid rgba(0,0,0,0.08)', width: 180 }}>Subtópico</th>
                            <th style={{ padding: '9px 14px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#666', borderBottom: '0.5px solid rgba(0,0,0,0.08)', width: 180 }}>Sub-subtópico</th>
                            <th style={{ padding: '9px 14px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#666', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>Gabarito</th>
                          </tr>
                        </thead>
                        <tbody>
                          {objQuestoes.map((q, idx) => {
                            const opts = q.alternativas === 'A-D' ? ['A','B','C','D'] : ['A','B','C','D','E']
                            const val = gabaritoMap[q.id] || ''
                            return (
                              <tr key={q.id} style={{ borderBottom: idx < objQuestoes.length - 1 ? '0.5px solid rgba(0,0,0,0.06)' : 'none', background: idx % 2 === 1 ? '#FAFAFA' : 'white' }}>
                                <td style={{ padding: '8px 14px', fontSize: 13, color: '#888', fontWeight: 500 }}>{q.numero}</td>
                                <td style={{ padding: '8px 14px', fontSize: 13, color: '#333', fontWeight: 500 }}>{q.materia}</td>
                                {(['topico', 'subtopico', 'subsubtopico'] as const).map(campo => (
                                  <td key={campo} style={{ padding: '4px 8px' }}>
                                    <input
                                      value={topicosMap[q.id]?.[campo] || ''}
                                      onChange={e => setTopicosMap(m => ({ ...m, [q.id]: { ...m[q.id], [campo]: e.target.value } }))}
                                      placeholder="—"
                                      style={{
                                        width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.12)',
                                        fontSize: 12, fontFamily: 'DM Sans, sans-serif', color: '#1a1a1a',
                                        background: 'transparent', outline: 'none', boxSizing: 'border-box',
                                      }}
                                    />
                                  </td>
                                ))}
                                <td style={{ padding: '6px 14px' }}>
                                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                                    {opts.map(letra => (
                                      <button
                                        key={letra}
                                        onClick={() => setGabaritoMap(m => ({ ...m, [q.id]: m[q.id] === letra ? '' : letra }))}
                                        style={{
                                          width: 30, height: 30, borderRadius: 6, border: '1px solid',
                                          cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'DM Sans, sans-serif',
                                          borderColor: val === letra ? '#f97316' : 'rgba(0,0,0,0.15)',
                                          background: val === letra ? '#f97316' : 'white',
                                          color: val === letra ? 'white' : '#555',
                                          transition: 'all 0.1s',
                                        }}
                                      >
                                        {letra}
                                      </button>
                                    ))}
                                    <button
                                      onClick={() => setGabaritoMap(m => ({ ...m, [q.id]: m[q.id] === 'ANULADA' ? '' : 'ANULADA' }))}
                                      style={{
                                        padding: '0 10px', height: 30, borderRadius: 6, border: '1px solid',
                                        cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'DM Sans, sans-serif',
                                        borderColor: val === 'ANULADA' ? '#DC2626' : 'rgba(0,0,0,0.15)',
                                        background: val === 'ANULADA' ? '#DC2626' : 'white',
                                        color: val === 'ANULADA' ? 'white' : '#888',
                                        transition: 'all 0.1s',
                                      }}
                                    >
                                      ANULADA
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}

          <button
            onClick={salvarGabarito} disabled={salvandoGabarito}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: 14, borderRadius: 12, border: 'none',
              background: salvandoGabarito ? '#ccc' : 'var(--purple)',
              color: 'white', fontSize: 14, fontWeight: 600,
              cursor: salvandoGabarito ? 'not-allowed' : 'pointer',
              fontFamily: 'DM Sans, sans-serif',
            }}
          >
            <Save size={15} /> {salvandoGabarito ? 'Salvando...' : 'Salvar gabarito'}
          </button>
        </div>
      )}

      {/* ── RESULTADOS ── */}
      {tab === 'resultados' && (
        <div style={{ padding: '16px', maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Modo ranking (ENEM) */}
          {isENEM && (scores.length > 0 || triScores.length > 0) && (
            <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: 10, padding: 3, gap: 2, alignSelf: 'flex-start' }}>
              {([['bruto', 'Pontuação bruta'], ['tri', 'Pseudo-TRI']] as const).map(([val, label]) => (
                <button key={val} onClick={() => setModoRanking(val)} style={{
                  padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: modoRanking === val ? 600 : 400,
                  background: modoRanking === val ? 'white' : 'transparent',
                  color: modoRanking === val ? '#1a1a1a' : '#888',
                  boxShadow: modoRanking === val ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                  fontFamily: 'DM Sans, sans-serif',
                }}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* TRI Ranking (ENEM) */}
          {isENEM && modoRanking === 'tri' && (() => {
            const byAluno: Record<string, { nome: string; scores: Record<string, number> }> = {}
            triScores.forEach(t => {
              if (!byAluno[t.aluno_id]) byAluno[t.aluno_id] = { nome: t.nome, scores: {} }
              byAluno[t.aluno_id].scores[t.area_tri] = t.nota_tri
            })
            const triAlunos: TriAluno[] = Object.entries(byAluno).map(([aluno_id, { nome, scores }]) => {
              const LC = scores['LC'] || 0, CH = scores['CH'] || 0
              const CN = scores['CN'] || 0, MT = scores['MT'] || 0
              const areasPresentes = [LC, CH, CN, MT].filter(v => v > 0).length
              const media = areasPresentes > 0 ? (LC + CH + CN + MT) / Math.max(areasPresentes, 1) : 0
              return { aluno_id, nome, LC, CH, CN, MT, media }
            }).sort((a, b) => b.media - a.media)

            if (triAlunos.length === 0) return (
              <div style={{ textAlign: 'center', padding: '24px 16px', color: '#aaa', fontSize: 13 }}>
                Importe os resultados para calcular o Pseudo-TRI.
              </div>
            )

            const triColor = (n: number) => n >= 600 ? '#166534' : n >= 450 ? '#854d0e' : '#991B1B'
            const triBg = (n: number) => n >= 600 ? '#DCFCE7' : n >= 450 ? '#FEF9C3' : '#FEE2E2'

            return (
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#333', marginBottom: 8 }}>
                  Pseudo-TRI — {triAlunos.length} aluno(s) · escala 0–1000 por área
                </div>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 10 }}>
                  Questões com menor aproveitamento valem mais. Média da turma = 500 por área.
                </div>
                <div style={{ border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 12, overflow: 'hidden', background: 'white', overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC' }}>
                        {['#', 'Aluno', 'LC', 'CH', 'CN', 'MT', 'Média'].map(h => (
                          <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Aluno' ? 'left' : 'center', fontWeight: 600, color: '#666', borderBottom: '0.5px solid rgba(0,0,0,0.08)', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {triAlunos.map((a, i) => (
                        <tr key={a.aluno_id} style={{ borderBottom: i < triAlunos.length - 1 ? '0.5px solid rgba(0,0,0,0.05)' : 'none', background: i % 2 === 1 ? '#FAFAFA' : 'white' }}>
                          <td style={{ padding: '7px 10px', color: '#aaa', fontSize: 11, textAlign: 'center' }}>{i + 1}</td>
                          <td style={{ padding: '7px 10px', fontWeight: 500 }}>{a.nome}</td>
                          {(['LC', 'CH', 'CN', 'MT'] as const).map(area => (
                            <td key={area} style={{ padding: '6px 8px', textAlign: 'center' }}>
                              {a[area] > 0
                                ? <span style={{ background: triBg(a[area]), color: triColor(a[area]), fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 6 }}>{a[area].toFixed(0)}</span>
                                : <span style={{ color: '#ccc', fontSize: 11 }}>—</span>
                              }
                            </td>
                          ))}
                          <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, fontSize: 13 }}>
                            {a.media > 0 ? a.media.toFixed(0) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })()}

          {/* Ranking de alunos (bruto) */}
          {(!isENEM || modoRanking === 'bruto') && scores.length > 0 && (() => {
            const temRedacao = questoes.some(q => q.fase === 2)
            const pontoMaxObj = questoes.filter(q => q.fase === 1).reduce((acc, q) => acc + q.pontuacao_max, 0)
            const pontoMaxTotal = questoes.reduce((acc, q) => acc + q.pontuacao_max, 0)
            const pontoMax = comRedacao ? pontoMaxTotal : pontoMaxObj
            const ranking = [...scores].sort((a, b) =>
              comRedacao ? b.total_pontos - a.total_pontos : b.pontos_objetiva - a.pontos_objetiva
            )
            return (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#333' }}>
                    Ranking — {ranking.length} aluno(s) · {pontoMax} pts possíveis
                  </div>
                  {temRedacao && (
                    <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: 8, padding: 3, gap: 2 }}>
                      {['Sem redação', 'Com redação'].map((label, idx) => {
                        const active = idx === 0 ? !comRedacao : comRedacao
                        return (
                          <button key={label} onClick={() => setComRedacao(idx === 1)} style={{
                            padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                            fontSize: 11, fontWeight: active ? 600 : 400,
                            background: active ? 'white' : 'transparent',
                            color: active ? '#1a1a1a' : '#888',
                            boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                            fontFamily: 'DM Sans, sans-serif',
                          }}>
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
                <div style={{ border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 12, overflow: 'hidden', background: 'white' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC' }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#666', borderBottom: '0.5px solid rgba(0,0,0,0.08)', width: 36 }}>#</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#666', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>Aluno</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#666', borderBottom: '0.5px solid rgba(0,0,0,0.08)', width: 80 }}>Pontos</th>
                        {comRedacao && <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#666', borderBottom: '0.5px solid rgba(0,0,0,0.08)', width: 72 }}>Redação</th>}
                        <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#666', borderBottom: '0.5px solid rgba(0,0,0,0.08)', width: 56 }}>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranking.map((a, i) => {
                        const pts = comRedacao ? a.total_pontos : a.pontos_objetiva
                        const materias = scoresMat
                          .filter(m => m.aluno_id === a.aluno_id && m.fase === 1)
                          .sort((x, y) => {
                            const qs = questoes.find(q => q.materia === x.materia && q.fase === 1)
                            const qt = questoes.find(q => q.materia === y.materia && q.fase === 1)
                            return (qs?.numero ?? 0) - (qt?.numero ?? 0)
                          })
                        const isLast = i === ranking.length - 1
                        return (
                          <>
                            <tr key={a.aluno_id} style={{ background: i % 2 === 1 ? '#FAFAFA' : 'white' }}>
                              <td style={{ padding: '7px 12px', color: '#aaa', fontSize: 12 }}>{i + 1}</td>
                              <td style={{ padding: '7px 12px', fontWeight: 500 }}>{a.nome}</td>
                              <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600 }}>{pts.toFixed(1)}</td>
                              {comRedacao && <td style={{ padding: '7px 12px', textAlign: 'right', color: '#888', fontSize: 12 }}>{a.pontos_redacao.toFixed(1)}</td>}
                              <td style={{ padding: '7px 12px', textAlign: 'right', color: '#888', fontSize: 12 }}>
                                {pontoMax > 0 ? ((pts / pontoMax) * 100).toFixed(0) : 0}%
                              </td>
                            </tr>
                            {materias.length > 0 && (
                              <tr key={`${a.aluno_id}-mat`} style={{ borderBottom: !isLast ? '0.5px solid rgba(0,0,0,0.05)' : 'none', background: i % 2 === 1 ? '#FAFAFA' : 'white' }}>
                                <td />
                                <td colSpan={comRedacao ? 4 : 3} style={{ padding: '0 12px 8px' }}>
                                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                    {materias.map(m => {
                                      const pct = m.total_questoes > 0 ? m.acertos / m.total_questoes : 0
                                      const bg = pct >= 0.7 ? '#DCFCE7' : pct >= 0.5 ? '#FEF9C3' : '#FEE2E2'
                                      const color = pct >= 0.7 ? '#166534' : pct >= 0.5 ? '#854d0e' : '#991B1B'
                                      const label = m.materia.length > 4 ? m.materia.substring(0, 4) : m.materia
                                      return (
                                        <span key={m.materia} title={m.materia} style={{ background: bg, color, fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 6, whiteSpace: 'nowrap' }}>
                                          {label} {m.acertos}/{m.total_questoes}
                                        </span>
                                      )
                                    })}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })()}

          <div style={{ background: '#F0F9FF', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#0369a1', lineHeight: 1.6 }}>
            <strong>Formato CSV:</strong> Col A: Nome · Col B: E-mail · Col C+: respostas em ordem (objetiva = letra, dissertativa = pontuação).<br />
            Uma importação por dia de prova.
          </div>

          {/* Seletor fase/dia */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 4 }}>Fase</label>
              <select style={inp} value={faseCSV} onChange={e => { setFaseCSV(Number(e.target.value)); setDiaCSV(1); setLinhasCSV([]) }}>
                {fases.map(f => <option key={f} value={f}>Fase {f}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 4 }}>Dia</label>
              <select style={inp} value={diaCSV} onChange={e => { setDiaCSV(Number(e.target.value)); setLinhasCSV([]) }}>
                {diasDisponiveis.map(d => <option key={d} value={d}>Dia {d}</option>)}
              </select>
            </div>
            {isENEM && faseCSV === 1 && diaCSV === 1 && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 4 }}>Grupo linguagem</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['ingles', 'espanhol'] as const).map(g => (
                    <button key={g} onClick={() => { setGrupoLinguagem(g); setLinhasCSV([]) }} style={{
                      padding: '8px 12px', borderRadius: 8, border: '1px solid',
                      cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'DM Sans, sans-serif',
                      borderColor: grupoLinguagem === g ? 'var(--purple)' : 'rgba(0,0,0,0.12)',
                      background: grupoLinguagem === g ? 'var(--purple-light)' : 'white',
                      color: grupoLinguagem === g ? 'var(--purple)' : '#555',
                    }}>
                      {g === 'ingles' ? 'Inglês' : 'Espanhol'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '8px 12px', fontSize: 12, color: '#555' }}>
            {questoesDia.length} questões no Dia {diaCSV} da Fase {faseCSV}:{' '}
            {questoesDia.map(q => `Q${q.numero} ${q.tipo === 'objetiva' ? '(obj)' : '(dis)'}`).join(' · ')}
          </div>

          {erroResultados && (
            <div style={{ background: '#FEF2F2', color: '#991B1B', fontSize: 12, padding: '10px 14px', borderRadius: 10, whiteSpace: 'pre-line' }}>{erroResultados}</div>
          )}
          {sucessoResultados && (
            <div style={{ background: '#F0FDF4', color: '#166534', fontSize: 13, padding: '10px 14px', borderRadius: 10 }}>{sucessoResultados}</div>
          )}

          {/* Upload */}
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              border: '2px dashed rgba(0,0,0,0.15)', borderRadius: 14, padding: '32px 20px',
              textAlign: 'center', cursor: 'pointer', background: '#FAFAFA',
            }}
          >
            <Upload size={24} color="#aaa" style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 14, fontWeight: 500, color: '#555' }}>Clique para selecionar o arquivo</div>
            <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>.xlsx ou .csv</div>
            <input
              ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
              onChange={e => { if (e.target.files?.[0]) processarCSV(e.target.files[0]) }}
            />
          </div>

          {linhasCSV.length > 0 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{linhasCSV.length} aluno(s) encontrado(s)</div>
              <div style={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, overflow: 'hidden', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC' }}>
                      <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: '#666', borderBottom: '0.5px solid rgba(0,0,0,0.08)', whiteSpace: 'nowrap' }}>Nome</th>
                      <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: '#666', borderBottom: '0.5px solid rgba(0,0,0,0.08)', whiteSpace: 'nowrap' }}>E-mail</th>
                      {questoesDia.map(q => (
                        <th key={q.id} style={{ padding: '7px 8px', textAlign: 'center', fontWeight: 600, color: '#666', borderBottom: '0.5px solid rgba(0,0,0,0.08)', whiteSpace: 'nowrap' }}>
                          Q{q.numero}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {linhasCSV.slice(0, 8).map((row, i) => (
                      <tr key={i} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
                        <td style={{ padding: '6px 10px', fontWeight: 500 }}>{row[0]}</td>
                        <td style={{ padding: '6px 10px', color: '#888' }}>{row[1]}</td>
                        {questoesDia.map((_, qi) => (
                          <td key={qi} style={{ padding: '6px 8px', textAlign: 'center', color: '#555' }}>{row[qi + 2] ?? '—'}</td>
                        ))}
                      </tr>
                    ))}
                    {linhasCSV.length > 8 && (
                      <tr>
                        <td colSpan={questoesDia.length + 2} style={{ padding: '6px 10px', color: '#aaa', fontSize: 11 }}>
                          + {linhasCSV.length - 8} aluno(s) não exibidos
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <button
                onClick={importarResultados} disabled={salvandoResultados}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: 14, borderRadius: 12, border: 'none',
                  background: salvandoResultados ? '#ccc' : 'var(--purple)',
                  color: 'white', fontSize: 14, fontWeight: 600,
                  cursor: salvandoResultados ? 'not-allowed' : 'pointer',
                  fontFamily: 'DM Sans, sans-serif',
                }}
              >
                <Upload size={15} /> {salvandoResultados ? 'Importando...' : `Importar resultados`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
