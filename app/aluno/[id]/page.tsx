'use client'
import ListasPage from '@/app/listas/page'
import { useEffect, useState } from 'react'
import { dbQuery } from '@/lib/supabase'
import Nav from '@/components/Nav'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import { CORES_MATERIA as CORES_MAT_IMPORT } from '@/lib/cores'
import { BarChart, GraficoQuestoes, RadarQuestoesChart, GraficoEvolucaoLinhas, RadarSection } from '@/components/aluno/AlunoCharts'
import { FileDown, Video } from 'lucide-react'
import { BannerRisco, DiagnosticoCorte } from '@/components/aluno/AlunoRisco'
import Termometro from './Termometro'

type AlunoCache = {
  dados: any[]; perfil: any; alunoInfo: any
  topicos: any[]; progressos: any[]; todos: any[]; ciclosDoAluno: string[]
  cicloAtivo: string | null
}
const alunoCache = new Map<string, AlunoCache>()
const CORES_MAT: Record<string, string> = {
  ...CORES_MAT_IMPORT,
  'Português/Redação': '#FB8C00',
}

export default function AlunoPage() {
  const router = useRouter()
  const params = useParams()
  const { perfil: meuPerfil } = useAuth()
  const id = params?.id as string

  const [dados, setDados] = useState<any[]>([])
  const [perfil, setPerfil] = useState<any>(null)
  const [alunoInfo, setAlunoInfo] = useState<any>(null)
  const [topicos, setTopicos] = useState<any[]>([])
  const [progressos, setProgressos] = useState<any[]>([])
  const [todos, setTodos] = useState<any[]>([])
  const [turmaQuestoes, setTurmaQuestoes] = useState<any[]>([])
  const [ciclosDoAluno, setCiclosDoAluno] = useState<string[]>([])
  const [turmaQuestoesLoaded, setTurmaQuestoesLoaded] = useState(false)
  const [cicloAtivo, setCicloAtivo] = useState<string | null>(null)
  const [aba, setAba] = useState<'geral' | 'simulados' | 'listas' | 'provas' | 'termometro'>('geral')
  const [loading, setLoading] = useState(true)
  const [provasAluno, setProvasAluno] = useState<any[]>([])
  const [correcoesProva, setCorrecoesProva] = useState<any[]>([])
  const [questoesProvas, setQuestoesProvas] = useState<any[]>([])
  const [provasLoaded, setProvasLoaded] = useState(false)

  // Aluno só pode ver o próprio perfil
  useEffect(() => {
    if (!meuPerfil || meuPerfil.papel !== 'aluno') return
    const meuId = meuPerfil.aluno_id
    if (meuId && id !== meuId) {
      router.replace(`/aluno/${meuId}`)
    }
  }, [meuPerfil, id])

  // Para aluno, usa o próprio id
  const targetId = meuPerfil?.papel === 'aluno' ? meuPerfil.aluno_id! : id

  useEffect(() => {
    if (!targetId) return
    load()
  }, [targetId])

  useEffect(() => {
    if (aba !== 'simulados' || turmaQuestoesLoaded || !ciclosDoAluno.length) return
    loadTurmaQuestoes()
  }, [aba, ciclosDoAluno, turmaQuestoesLoaded])

  useEffect(() => {
    if (aba !== 'provas' || provasLoaded || !targetId) return
    loadProvas()
  }, [aba, targetId, provasLoaded])

  async function load() {
    const cached = alunoCache.get(targetId)
    if (cached) {
      setDados(cached.dados)
      setPerfil(cached.perfil)
      setAlunoInfo(cached.alunoInfo)
      setTopicos(cached.topicos)
      setProgressos(cached.progressos)
      setTodos(cached.todos)
      setCiclosDoAluno(cached.ciclosDoAluno)
      if (cached.cicloAtivo) setCicloAtivo(cached.cicloAtivo)
      setLoading(false)
      return
    }

    // Rodada 1: dados do próprio aluno (5 queries pequenas em paralelo)
    const [
      { data: resultados },
      { data: perfilArr },
      { data: alunoArr },
      { data: ts },
      { data: ps },
    ] = await Promise.all([
      dbQuery('resultados', { id_aluno: `eq.${targetId}`, order: 'ciclo_nome' }),
      dbQuery('perfis', { aluno_id: `eq.${targetId}` }),
      dbQuery('alunos_dados', { id_aluno: `eq.${targetId}` }),
      dbQuery('topicos', {}, 'id,materia,topico'),
      dbQuery('progresso_topicos', { aluno_id: `eq.${targetId}` }, 'topico_id,status'),
    ])
    const perfilData = perfilArr?.[0] ?? null
    const alunoData = alunoArr?.[0] ?? null

    // Ciclos que este aluno tem — usados para filtrar os dados de turma
    const ciclos = [...new Set(
      (resultados || []).filter(r => r.fase === 'ranking').map(r => r.ciclo_nome as string)
    )]

    // Rodada 2: todos os rankings de todos os alunos (sem filtrar por ciclo) para que
    // a posição geral e o ranking por matéria sejam calculados igual à página de turma
    const [{ data: todosRanking }] = await Promise.all([
      dbQuery('resultados', { fase: 'eq.ranking' },
        'id_aluno,nome_aluno,ciclo_nome,nota_matematica,nota_fisica,nota_quimica,nota_portugues,nota_redacao,media_linguagens,media_1fase,media_2fase'),
    ])

    const rankings = (resultados || []).filter(r => r.fase === 'ranking')
      .sort((a, b) => parseInt((a.ciclo_nome || '').match(/\d+/)?.[0] || '0') - parseInt((b.ciclo_nome || '').match(/\d+/)?.[0] || '0'))
    const ultimoCiclo = rankings.length ? rankings[rankings.length - 1].ciclo_nome : null

    setDados(resultados || [])
    setPerfil(perfilData)
    setAlunoInfo(alunoData)
    setTopicos(ts || [])
    setProgressos(ps || [])
    setTodos(todosRanking || [])
    setCiclosDoAluno(ciclos)
    if (ultimoCiclo) setCicloAtivo(ultimoCiclo)
    setLoading(false)

    alunoCache.set(targetId, {
      dados: resultados || [],
      perfil: perfilData,
      alunoInfo: alunoData,
      topicos: ts || [],
      progressos: ps || [],
      todos: todosRanking || [],
      ciclosDoAluno: ciclos,
      cicloAtivo: ultimoCiclo,
    })
  }

  async function loadProvas() {
    const [{ data: pa }, { data: cp }] = await Promise.all([
      dbQuery('provas_aluno', { aluno_id: `eq.${targetId}`, order: 'data.desc' }),
      dbQuery('correcoes_prova', { aluno_id: `eq.${targetId}` }, 'prova_aluno_id,prova_id,respostas,notas,confirmed_at'),
    ])
    if (!pa?.length) { setProvasLoaded(true); return }
    const provaIds = [...new Set(pa.map((p: any) => p.prova_id))].join(',')
    const [{ data: detalhes }, { data: questoes }] = await Promise.all([
      dbQuery('provas_antigas', { id: `in.(${provaIds})` }),
      dbQuery('questoes_prova_antiga', { prova_id: `in.(${provaIds})` }, 'prova_id,numero,materia'),
    ])
    const detalheMap = Object.fromEntries((detalhes || []).map((d: any) => [d.id, d]))
    setProvasAluno(pa.map((p: any) => ({ ...p, prova: detalheMap[p.prova_id] })))
    setCorrecoesProva(cp || [])
    setQuestoesProvas(questoes || [])
    setProvasLoaded(true)
  }

  function analiseCumulativaProvas() {
    const corrigidasCompletas = correcoesProva.filter(c => c.confirmed_at)
    const errorCount: Record<string, number> = {}
    corrigidasCompletas.forEach(c => {
      const provaInfo = provasAluno.find(pa => pa.id === c.prova_aluno_id)?.prova
      const questoesDaProva = questoesProvas.filter((q: any) => q.prova_id === c.prova_id)
      if (provaInfo?.modelo === 'multipla_escolha') {
        const resps = c.respostas || {}
        questoesDaProva.forEach((q: any) => {
          if (resps[String(q.numero)] && resps[String(q.numero)] !== 'acertou') {
            errorCount[q.materia] = (errorCount[q.materia] || 0) + 1
          }
        })
      } else {
        const notas = c.notas || {}
        questoesDaProva.forEach((q: any) => {
          if (Number(notas[String(q.numero)] ?? 1) < 0.7) {
            errorCount[q.materia] = (errorCount[q.materia] || 0) + 1
          }
        })
      }
    })
    return Object.entries(errorCount).sort((a, b) => b[1] - a[1])
  }

  async function loadTurmaQuestoes() {
    const { data } = await dbQuery('resultados', {
      fase: 'neq.ranking',
      ciclo_nome: `in.(${ciclosDoAluno.join(',')})`,
      notas_questoes: 'not.is.null',
    }, 'id_aluno,ciclo_nome,fase,notas_questoes')
    setTurmaQuestoes(data || [])
    setTurmaQuestoesLoaded(true)
  }

  const nomeAluno = alunoInfo?.nome || perfil?.nome || '...'
  const rankings = dados.filter(r => r.fase === 'ranking')
  const ciclos = [...new Set(rankings.map(r => r.ciclo_nome))].sort((a: string, b: string) =>
    parseInt(a.match(/\d+/)?.[0] || '0') - parseInt(b.match(/\d+/)?.[0] || '0')
  )
  const rankingAtivo = rankings.find(r => r.ciclo_nome === cicloAtivo)

  // Ranking geral — deduplica por ciclo_nome (um aluno pode ter linhas ITA e IME com mesmo ciclo_nome)
  function mediaAluno(alunoId: string) {
    const rs = todos.filter(r => r.id_aluno === alunoId)
    if (!rs.length) return 0
    const seen = new Set<string>()
    const vals = rs
      .filter(r => { if (seen.has(r.ciclo_nome)) return false; seen.add(r.ciclo_nome); return true })
      .map(r => Number(r.media_2fase) || Number(r.media_1fase) || 0)
      .filter(Boolean)
    if (!vals.length) return 0
    return vals.reduce((a, b) => a + b, 0) / vals.length
  }

  const alunosUnicos = [...new Map(todos.map(r => [r.id_aluno, r])).values()]
  const rankingGeral = [...alunosUnicos].sort((a, b) => mediaAluno(b.id_aluno) - mediaAluno(a.id_aluno))
  const posicaoGeral = rankingGeral.findIndex(r => r.id_aluno === targetId) + 1

  // Ranking por matéria
  function mediaMateriaAluno(alunoId: string, campo: string) {
    const rs = todos.filter(r => r.id_aluno === alunoId && r[campo] !== null)
    if (!rs.length) return 0
    return rs.reduce((a, r) => a + Number(r[campo] || 0), 0) / rs.length
  }

  const materiasCampos = [
    { label: 'Matemática', campo: 'nota_matematica' },
    { label: 'Física', campo: 'nota_fisica' },
    { label: 'Química', campo: 'nota_quimica' },
    { label: 'Port./Redação', campo: 'media_linguagens' },
  ]

  // Busca o registro 2fase_port do ciclo ativo (onde nota_portugues/nota_redacao vivem)
  const cicloNum = String(cicloAtivo || '').match(/\d+/)?.[0] || ''
  const reg2fPort = dados.find(r =>
    String(r.ciclo_nome || '').match(/\d+/)?.[0] === cicloNum && r.fase === '2fase_port'
  )

  // Ciclo tem redação = aluno tem registro 2fase_port para este ciclo
  function temRedacaoCiclo(ciclo: string | null) {
    if (!ciclo) return false
    const num = String(ciclo).match(/\d+/)?.[0] || ''
    return dados.some(r => String(r.ciclo_nome || '').match(/\d+/)?.[0] === num && r.fase === '2fase_port')
  }

  function rankingMateria(campo: string) {
    return [...alunosUnicos]
      .sort((a, b) => mediaMateriaAluno(b.id_aluno, campo) - mediaMateriaAluno(a.id_aluno, campo))
      .findIndex(r => r.id_aluno === targetId) + 1
  }

  // Cronograma por matéria
  const materiasTopicos = [...new Set(topicos.map(t => t.materia))].sort()
  const cronogramaBarras = materiasTopicos.map(mat => {
    const ts = topicos.filter(t => t.materia === mat)
    const fin = progressos.filter(p => p.status === 'finalizada' && ts.some(t => t.id === p.topico_id)).length
    return { materia: mat, pct: ts.length ? Math.round((fin / ts.length) * 100) : 0 }
  })

  // Média geral do aluno — calculada direto de rankings (mesma deduplicação que as abas mostram)
  const mediaGeralAluno = (() => {
    const seen = new Set<string>()
    const vals = rankings
      .filter(r => { if (seen.has(r.ciclo_nome)) return false; seen.add(r.ciclo_nome); return true })
      .map(r => Number(r.media_2fase) || Number(r.media_1fase) || 0)
      .filter(Boolean)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  })()

  // Notas por ciclo para gráfico de evolução
  function corNota(n: number) { return n >= 7 ? '#16A34A' : n >= 4 ? '#D97706' : '#DC2626' }

  function NotaBar({ nota, label, naoFez }: { nota: number, label: string, naoFez?: boolean }) {
    if (naoFez) return (
      <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <span style={{ color: '#666' }}>{label}</span>
        <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Não fez</span>
      </div>
    )
    const cor = corNota(nota)
    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
          <span style={{ color: '#666' }}>{label}</span>
          <span style={{ fontWeight: 600, color: cor }}>{nota.toFixed(1)}</span>
        </div>
        <div style={{ height: 5, background: '#F1F5F9', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${(nota / 10) * 100}%`, background: cor, borderRadius: 3 }} />
        </div>
      </div>
    )
  }

  function PizzaChart({ gabarito, parcial, zero, materia }: { gabarito: number, parcial: number, zero: number, materia: string }) {
    const total = gabarito + parcial + zero
    if (!total) return null
    const cor = CORES_MAT[materia] || '#f97316'
    const r = 48, cx = 60, cy = 60, stroke = 20
    const circ = 2 * Math.PI * r
    const gab = (gabarito / total) * circ
    const par = (parcial / total) * circ
    const pctGab = Math.round((gabarito / total) * 100)
    const pctPar = Math.round((parcial / total) * 100)
    const pctZer = Math.round((zero / total) * 100)
    const zerOffset = -(gab + par)
    return (
      <div style={{ textAlign: 'center' }}>
        <svg viewBox="0 0 120 120" width="130" height="130">
          {/* Base cinza (zero) */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#E8E8E8" strokeWidth={stroke} />
          {/* Zero — ocupa o restante */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#D0D0D0" strokeWidth={stroke}
            strokeDasharray={`${(zero/total)*circ} ${circ - (zero/total)*circ}`}
            strokeDashoffset={zerOffset}
            transform="rotate(-90 60 60)" />
          {/* Parcial — laranja */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#D97706" strokeWidth={stroke}
            strokeDasharray={`${par} ${circ - par}`}
            strokeDashoffset={-(gab)}
            transform="rotate(-90 60 60)" />
          {/* Gabarito — cor da matéria */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={cor} strokeWidth={stroke}
            strokeDasharray={`${gab} ${circ - gab}`}
            strokeDashoffset="0"
            transform="rotate(-90 60 60)" />
          <text x="60" y="55" textAnchor="middle" fontSize="14" fontWeight="700" fill="#1a1a1a">{pctGab}%</text>
          <text x="60" y="70" textAnchor="middle" fontSize="9" fill="#999">gabarito</text>
        </svg>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#1a1a1a', marginTop: 4 }}>{materia}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: cor, display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: cor, display: 'inline-block' }} />
            Gabarito: {gabarito} ({pctGab}%)
          </span>
          <span style={{ fontSize: 11, color: '#D97706', display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#D97706', display: 'inline-block' }} />
            Parcial: {parcial} ({pctPar}%)
          </span>
          <span style={{ fontSize: 11, color: '#bbb', display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#E8E8E8', display: 'inline-block' }} />
            Zero: {zero} ({pctZer}%)
          </span>
        </div>
      </div>
    )
  }

  function pizzaData(fase: string) {
    // Extrai o número do ciclo do cicloAtivo (ex: "Ranking C1" -> "1", "Ciclo 1 - ITA" -> "1")
    const numCiclo = cicloAtivo?.match(/\d+/)?.[0] || ''
    // Busca a aba correspondente que contenha o número do ciclo e a fase
    const reg = dados.find(r => {
      const temNumero = r.ciclo_nome?.includes(numCiclo)
      return temNumero && r.fase === fase
    })
    if (!reg?.notas_questoes) return { gabarito: 0, parcial: 0, zero: 0 }
    const vals = Object.values(reg.notas_questoes) as number[]
    return {
      gabarito: vals.filter((v: any) => Number(v) >= 0.9).length,
      parcial: vals.filter((v: any) => Number(v) > 0 && Number(v) < 0.9).length,
      zero: vals.filter((v: any) => Number(v) === 0).length,
    }
  }


  function RadarChart({ dados, titulo }: { dados: { materia: string, nota: number }[], titulo: string }) {
    if (!dados.length) return null
    const n = dados.length
    const cx = 150, cy = 150, raio = 110
    const max = 10
    const niveis = [2, 4, 6, 8, 10]

    function ponto(idx: number, valor: number): [number, number] {
      const angulo = (Math.PI * 2 * idx) / n - Math.PI / 2
      const r = (valor / max) * raio
      return [cx + r * Math.cos(angulo), cy + r * Math.sin(angulo)]
    }

    function pontoEixo(idx: number, r: number): [number, number] {
      const angulo = (Math.PI * 2 * idx) / n - Math.PI / 2
      return [cx + r * Math.cos(angulo), cy + r * Math.sin(angulo)]
    }

    const pontos = dados.map((d, i) => ponto(i, d.nota))
    const polyPath = pontos.map(([x, y]) => `${x},${y}`).join(' ')

    return (
      <div style={{ textAlign: 'center' }}>
        <svg viewBox="0 0 300 300" width="100%" style={{ maxWidth: 300 }}>
          {/* Níveis */}
          {niveis.map(nivel => {
            const ps = dados.map((_, i) => pontoEixo(i, (nivel / max) * raio))
            const path = ps.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ') + 'Z'
            return (
              <g key={nivel}>
                <path d={path} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="1" />
                <text x={cx} y={cy - (nivel / max) * raio - 3} textAnchor="middle" fontSize="8" fill="#bbb">{nivel}</text>
              </g>
            )
          })}
          {/* Eixos */}
          {dados.map((_, i) => {
            const [x, y] = pontoEixo(i, raio)
            return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(0,0,0,0.08)" strokeWidth="1" />
          })}
          {/* Área preenchida */}
          <polygon points={polyPath} fill="#f97316" fillOpacity="0.15" stroke="#f97316" strokeWidth="2" />
          {/* Pontos */}
          {pontos.map(([x, y], i) => {
            const cor = (CORES_MAT as any)[dados[i].materia] || '#f97316'
            return (
              <g key={i}>
                <circle cx={x} cy={y} r="5" fill={cor} stroke="white" strokeWidth="1.5" />
                <text x={x} y={y - 8} textAnchor="middle" fontSize="9" fontWeight="600" fill={cor}>
                  {dados[i].nota.toFixed(1)}
                </text>
              </g>
            )
          })}
          {/* Labels das matérias */}
          {dados.map((d, i) => {
            const [x, y] = pontoEixo(i, raio + 18)
            const cor = (CORES_MAT as any)[d.materia] || '#f97316'
            // Quebra nome longo
            const nome = d.materia.length > 10 ? d.materia.replace('/', '/\n') : d.materia
            return (
              <text key={i} x={x} y={y} textAnchor="middle" fontSize="10" fontWeight="600" fill={cor} dominantBaseline="middle">
                {d.materia}
              </text>
            )
          })}
        </svg>
      </div>
    )
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>Carregando...</div>

  const isOwn = meuPerfil?.papel === 'aluno'

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        {!isOwn && <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>←</button>}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{nomeAluno}</div>
          <div style={{ fontSize: 11, color: '#999' }}>{alunoInfo?.mentor}</div>
        </div>
        {isOwn && (
          <Link href="/dados-pessoais" style={{ textDecoration: 'none', fontSize: 11, color: '#f97316', border: '0.5px solid #f97316', borderRadius: 8, padding: '5px 10px' }}>
            ✎ Meus dados
          </Link>
        )}
        {!isOwn && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Link
              href={`/videochamada/mentoria-estrategia-${targetId}`}
              title="Iniciar videochamada"
              style={{
                textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 11, color: '#16a34a',
                border: '0.5px solid #bbf7d0', borderRadius: 8, padding: '5px 10px',
                background: '#f0fdf4',
              }}
            >
              <Video size={13} strokeWidth={2} /> Chamada
            </Link>
            <Link
              href={`/aluno/${targetId}/relatorio`}
              target="_blank"
              style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#f97316', border: '0.5px solid rgba(124,58,237,0.4)', borderRadius: 8, padding: '5px 10px' }}
            >
              <FileDown size={13} strokeWidth={2} /> PDF
            </Link>
          </div>
        )}
        {isOwn && (
          <Link
            href={`/videochamada/mentoria-estrategia-${targetId}`}
            title="Videochamada com mentor"
            style={{
              textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 11, color: '#16a34a',
              border: '0.5px solid #bbf7d0', borderRadius: 8, padding: '5px 10px',
              background: '#f0fdf4',
            }}
          >
            <Video size={13} strokeWidth={2} /> Chamada
          </Link>
        )}
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 4, padding: '8px 16px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
        {[
          { id: 'geral', label: 'Visão geral' },
          { id: 'simulados', label: 'Simulados' },
          { id: 'termometro', label: '🌡 Termômetro' },
          { id: 'listas', label: 'Listas' },
          { id: 'provas', label: '📄 Provas' },
        ].map(a => (
          <button key={a.id} onClick={() => setAba(a.id as any)} style={{
            padding: '5px 14px', borderRadius: 16, fontSize: 11, border: 'none',
            background: aba === a.id ? '#f97316' : '#F1F5F9',
            color: aba === a.id ? 'white' : '#666',
            cursor: 'pointer', fontFamily: 'DM Sans,sans-serif'
          }}>{a.label}</button>
        ))}
      </div>

      <div style={{ padding: 16 }}>

        {/* === ABA GERAL === */}
        {aba === 'geral' && (
          <>
            {/* Semáforo de risco — ciclo mais recente */}
            {rankingAtivo && (
              <BannerRisco dados={dados} rankingAtivo={rankingAtivo} cicloAtivo={cicloAtivo} />
            )}

            {/* Perfil */}
            <div className="card" style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                <div style={{ position: 'relative' }}>
                  {perfil?.foto_url ? (
                    <img src={perfil.foto_url} alt={nomeAluno} style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 600, color: '#1E40AF' }}>
                      {nomeAluno.split(' ').map((w: string) => w[0]).slice(0, 2).join('')}
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{nomeAluno}</div>
                  <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>ID: {targetId?.slice(0, 8)}</div>
                  {perfil?.modalidade && (
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#fff7ed', color: '#1E40AF', marginTop: 4, display: 'inline-block' }}>
                      {perfil.modalidade === 'presencial' ? '🏫 Presencial' : '💻 Online'}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '0.5px solid rgba(0,0,0,0.06)', paddingTop: 12 }}>
                {perfil?.email && <div style={{ fontSize: 12 }}><span style={{ color: '#999' }}>✉ </span>{perfil.email}</div>}
                {perfil?.telefone && <div style={{ fontSize: 12 }}><span style={{ color: '#999' }}>📱 </span>{perfil.telefone}</div>}
                {perfil?.cidade && <div style={{ fontSize: 12 }}><span style={{ color: '#999' }}>📍 </span>{perfil.cidade}</div>}
                {perfil?.data_nascimento && <div style={{ fontSize: 12 }}><span style={{ color: '#999' }}>🎂 </span>{new Date(perfil.data_nascimento).toLocaleDateString('pt-BR')}</div>}
              </div>
            </div>

            {/* Ranking */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div className="card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#f97316' }}>#{posicaoGeral}</div>
                <div style={{ fontSize: 11, color: '#999' }}>Ranking geral</div>
                <div style={{ fontSize: 10, color: '#bbb' }}>média {mediaGeralAluno.toFixed(1)}</div>
              </div>
              <div className="card" style={{ padding: '12px 10px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8 }}>Por matéria</div>
                {materiasCampos.map(({ label, campo }) => {
                  const pos = rankingMateria(campo)
                  if (!pos) return null
                  return (
                    <div key={campo} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                      <span style={{ color: '#666' }}>{label}</span>
                      <span style={{ fontWeight: 600, color: '#f97316' }}>#{pos}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Radar de desempenho */}
            {rankings.length > 0 && (
              <RadarSection rankings={rankings} />
            )}

            {/* Cronograma */}
            {cronogramaBarras.length > 0 && (
              <div className="card" style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Cronograma por matéria</div>
                <BarChart dados={cronogramaBarras} />
              </div>
            )}
          </>
        )}

        {/* === ABA SIMULADOS === */}
        {aba === 'simulados' && (
          <>
            {/* Seletor de ciclo */}
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 14, paddingBottom: 4 }}>
              {ciclos.map(c => (
                <button key={c} onClick={() => setCicloAtivo(c)} style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 11, border: '0.5px solid rgba(0,0,0,0.12)',
                  background: cicloAtivo === c ? '#f97316' : 'transparent', color: cicloAtivo === c ? 'white' : '#666',
                  cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'DM Sans,sans-serif'
                }}>{c.replace('Ciclo ', 'C').replace(' - ITA', '').replace(' - IME', '')}</button>
              ))}
            </div>

            {rankingAtivo && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 11, color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{cicloAtivo}</span>
                  <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 10, fontWeight: 500,
                    background: rankingAtivo.resultado_ciclo === 'Aprovado' ? '#DCFCE7' : rankingAtivo.resultado_ciclo === 'Reprovado' ? '#FEF2F2' : '#F1F5F9',
                    color: rankingAtivo.resultado_ciclo === 'Aprovado' ? '#14532D' : rankingAtivo.resultado_ciclo === 'Reprovado' ? '#991B1B' : '#5F5E5A' }}>
                    {rankingAtivo.resultado_ciclo === 'Aprovado' ? '✓ Aprovado' : rankingAtivo.resultado_ciclo === 'Reprovado' ? '✗ Reprovado' : '⏳ Em andamento'}
                  </span>
                </div>

                <div className="card" style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12 }}>Notas do ciclo</div>
                  {rankingAtivo.media_1fase !== null && <NotaBar nota={Number(rankingAtivo.media_1fase)} label="1ª Fase" />}
                  {rankingAtivo.nota_matematica !== null && <NotaBar nota={Number(rankingAtivo.nota_matematica)} label="Matemática (2ª fase)" />}
                  {rankingAtivo.nota_fisica !== null && <NotaBar nota={Number(rankingAtivo.nota_fisica)} label="Física (2ª fase)" />}
                  {rankingAtivo.nota_quimica !== null && <NotaBar nota={Number(rankingAtivo.nota_quimica)} label="Química (2ª fase)" />}
                  {reg2fPort?.nota_portugues != null
                    ? <NotaBar nota={Number(reg2fPort.nota_portugues)} label="Português (2ª fase)" />
                    : rankingAtivo.media_linguagens !== null && !reg2fPort
                      ? <NotaBar nota={Number(rankingAtivo.media_linguagens)} label="Port./Redação (2ª fase)" />
                      : null
                  }
                  {reg2fPort && (
                    reg2fPort.nota_redacao != null
                      ? <NotaBar nota={Number(reg2fPort.nota_redacao)} label="Redação (2ª fase)" />
                      : <NotaBar nota={0} label="Redação (2ª fase)" naoFez />
                  )}
                  {reg2fPort?.nota_portugues != null && rankingAtivo.media_linguagens !== null && (
                    <NotaBar nota={Number(rankingAtivo.media_linguagens)} label="Média Linguagens (2ª fase)" />
                  )}
                  {rankingAtivo.media_2fase !== null && (
                    <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.06)', marginTop: 10, paddingTop: 10 }}>
                      <NotaBar nota={Number(rankingAtivo.media_2fase)} label="Média Final" />
                    </div>
                  )}
                </div>

                {/* Diagnóstico de corte ITA / IME */}
                <DiagnosticoCorte dados={dados} rankingAtivo={rankingAtivo} cicloAtivo={cicloAtivo} />

                {/* Gráficos de acertos por questão */}
                <div className="card" style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Acertos por questão — 1ª Fase</div>
                  <GraficoQuestoes dados={dados} turmaQuestoes={turmaQuestoes} cicloAtivo={cicloAtivo} fase="1fase" titulo="1ª Fase" corAluno="#f97316" />
                </div>

                {/* Radar comparativo por questão — dissertativas */}
                <div className="card" style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Análise comparada — dissertativas</div>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 14 }}>Desempenho por questão: aluno, média e top 25% da turma</div>
                  <RadarQuestoesChart dados={dados} turmaQuestoes={turmaQuestoes} cicloAtivo={cicloAtivo} fase="2fase_mat" titulo="Matemática" corAluno="#f97316" />
                  <RadarQuestoesChart dados={dados} turmaQuestoes={turmaQuestoes} cicloAtivo={cicloAtivo} fase="2fase_fis" titulo="Física" corAluno="#1E88E5" />
                  <RadarQuestoesChart dados={dados} turmaQuestoes={turmaQuestoes} cicloAtivo={cicloAtivo} fase="2fase_qui" titulo="Química" corAluno="#E53935" />
                </div>

                <div className="card" style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 14 }}>Assertividade 2ª fase</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    {[
                      { fase: '2fase_mat', mat: 'Matemática' },
                      { fase: '2fase_fis', mat: 'Física' },
                      { fase: '2fase_qui', mat: 'Química' },
                    ].map(({ fase, mat }) => {
                      const p = pizzaData(fase)
                      if (!p.gabarito && !p.parcial && !p.zero) return null
                      return <PizzaChart key={fase} gabarito={p.gabarito} parcial={p.parcial} zero={p.zero} materia={mat} />
                    })}
                  </div>
                </div>
              </>
            )}

            {rankings.length > 1 && (
              <div className="card" style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 14 }}>Evolução por ciclo</div>
                <GraficoEvolucaoLinhas rankings={rankings} />
              </div>
            )}

            <div className="card">
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12 }}>Médias gerais (todos os ciclos)</div>
              {(() => {
                const dados2fPort = dados.filter(r => r.fase === '2fase_port')
                const temPort = dados2fPort.some(r => r.nota_portugues != null)
                const temRed = dados2fPort.some(r => r.nota_redacao != null)
                const media = (arr: any[], campo: string) => {
                  const vals = arr.map(r => Number(r[campo])).filter(v => v > 0)
                  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
                }
                const campos: { label: string; valor: number | null }[] = [
                  { label: 'Matemática',     valor: media(rankings, 'nota_matematica') },
                  { label: 'Física',         valor: media(rankings, 'nota_fisica') },
                  { label: 'Química',        valor: media(rankings, 'nota_quimica') },
                  ...(temPort
                    ? [{ label: 'Português', valor: media(dados2fPort, 'nota_portugues') }]
                    : []),
                  ...(temRed
                    ? [{ label: 'Redação',   valor: media(dados2fPort.filter(r => r.nota_redacao != null), 'nota_redacao') }]
                    : []),
                  { label: temPort ? 'Média Linguagens' : 'Port./Redação', valor: media(rankings, 'media_linguagens') },
                  { label: '1ª Fase',        valor: media(rankings, 'media_1fase') },
                ]
                return campos.map(({ label, valor }) => {
                  if (valor === null || valor === 0) return null
                  return <NotaBar key={label} nota={valor} label={label} />
                })
              })()}
            </div>
          </>
        )}

        {/* === ABA TERMÔMETRO === */}
        {aba === 'termometro' && (
          <Termometro rankings={rankings} />
        )}

        {/* === ABA LISTAS === */}
        {aba === 'listas' && (
          <ListasPage alunoId={targetId} />
        )}

        {/* === ABA PROVAS ANTIGAS === */}
        {aba === 'provas' && (
          <>
            {!provasLoaded ? (
              <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>Carregando...</div>
            ) : provasAluno.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', color: '#999', padding: 40 }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>📄</div>
                <div>Nenhuma prova antiga atribuída ainda.</div>
              </div>
            ) : (() => {
              const feitas = correcoesProva.filter(c => c.confirmed_at).length
              const pendentes = provasAluno.length - feitas
              const errosCumulativos = feitas > 0 ? analiseCumulativaProvas() : []
              const totalErros = errosCumulativos.reduce((s, [, n]) => s + n, 0)
              return (
                <>
                  {/* Painel de análise geral */}
                  <div className="card" style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Resumo geral</div>
                    <div style={{ display: 'flex', gap: 10, marginBottom: feitas > 0 ? 14 : 0 }}>
                      <div style={{ flex: 1, background: '#DCFCE7', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 22, fontWeight: 700, color: '#14532D' }}>{feitas}</div>
                        <div style={{ fontSize: 10, color: '#166534' }}>corrigida{feitas !== 1 ? 's' : ''}</div>
                      </div>
                      <div style={{ flex: 1, background: '#FEF9C3', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 22, fontWeight: 700, color: '#713F12' }}>{pendentes}</div>
                        <div style={{ fontSize: 10, color: '#854D0E' }}>pendente{pendentes !== 1 ? 's' : ''}</div>
                      </div>
                    </div>

                    {/* Top assuntos mais errados */}
                    {errosCumulativos.length > 0 && (
                      <>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#DC2626', marginBottom: 8 }}>
                          📊 Assuntos para revisar (todas as provas)
                        </div>
                        {errosCumulativos.slice(0, 6).map(([mat, qtd]) => {
                          const pct = Math.round((qtd / totalErros) * 100)
                          return (
                            <div key={mat} style={{ marginBottom: 7 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                                <span style={{ color: '#333' }}>{mat}</span>
                                <span style={{ fontWeight: 600, color: '#DC2626' }}>{qtd} erro{qtd > 1 ? 's' : ''}</span>
                              </div>
                              <div style={{ height: 5, background: '#F1F5F9', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${pct}%`, background: '#DC2626', borderRadius: 3 }} />
                              </div>
                            </div>
                          )
                        })}
                      </>
                    )}
                  </div>

                  {/* Cards individuais */}
                  {provasAluno.map(pa => {
                    const correcao = correcoesProva.find(c => c.prova_aluno_id === pa.id)
                    const corrigida = !!correcao?.confirmed_at
                    return (
                      <Link key={pa.id} href={`/minhas-provas/${pa.id}`} style={{ textDecoration: 'none' }}>
                        <div className="card" style={{ marginBottom: 10, borderLeft: `3px solid ${corrigida ? '#16A34A' : '#f97316'}` }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                            <div style={{ fontSize: 24, flexShrink: 0 }}>📄</div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: 14, color: '#1a1a1a', marginBottom: 3 }}>
                                {pa.prova?.nome || 'Prova'}
                              </div>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: '#EDE9FE', color: '#5B21B6', fontWeight: 600 }}>
                                  {(pa.prova?.tipo || '').toUpperCase()} · {pa.prova?.fase}ª Fase
                                </span>
                                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: '#F1F5F9', color: '#475569' }}>
                                  {pa.prova?.num_questoes}q
                                </span>
                              </div>
                              <div style={{ fontSize: 11, color: '#999' }}>
                                📅 {new Date(pa.data + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                              </div>
                            </div>
                            <div style={{
                              fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 10,
                              background: corrigida ? '#DCFCE7' : '#FEF9C3',
                              color: corrigida ? '#14532D' : '#713F12',
                              flexShrink: 0,
                            }}>
                              {corrigida ? '✓ Corrigida' : 'Pendente'}
                            </div>
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </>
              )
            })()}
          </>
        )}
      </div>
      <Nav />
    </div>
  )
}


