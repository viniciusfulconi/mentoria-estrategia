'use client'
import ListasPage from '@/app/listas/page'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Nav from '@/components/Nav'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'

import { CORES_MATERIA as CORES_MAT_IMPORT } from '@/lib/cores'

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

function BarChart({ dados }: { dados: { materia: string, pct: number }[] }) {
  if (!dados.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {dados.map(({ materia, pct }) => {
        const cor = CORES_MAT[materia] || '#2563EB'
        return (
          <div key={materia}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
              <span style={{ color: '#666' }}>{materia}</span>
              <span style={{ fontWeight: 600, color: cor }}>{pct}%</span>
            </div>
            <div style={{ height: 8, background: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: cor, borderRadius: 4, transition: 'width 0.5s' }} />
            </div>
          </div>
        )
      })}
    </div>
  )
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
  const [aba, setAba] = useState<'geral' | 'simulados' | 'listas'>('geral')
  const [loading, setLoading] = useState(true)

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
      { data: perfilData },
      { data: alunoData },
      { data: ts },
      { data: ps },
    ] = await Promise.all([
      supabase.from('resultados').select('*').eq('id_aluno', targetId).order('ciclo_nome'),
      supabase.from('perfis').select('*').eq('aluno_id', targetId).single(),
      supabase.from('alunos_dados').select('*').eq('id_aluno', targetId).single(),
      supabase.from('topicos').select('id, materia, nome'),
      supabase.from('progresso_topicos').select('topico_id, status').eq('aluno_id', targetId),
    ])

    // Ciclos que este aluno tem — usados para filtrar os dados de turma
    const ciclos = [...new Set(
      (resultados || []).filter(r => r.fase === 'ranking').map(r => r.ciclo_nome as string)
    )]

    // Rodada 2: apenas ranking da turma (turmaQuestoes carrega lazy ao abrir aba Simulados)
    const [{ data: todosRanking }] = ciclos.length
      ? await Promise.all([
          supabase.from('resultados')
            .select('id_aluno, nome_aluno, nota_matematica, nota_fisica, nota_quimica, media_linguagens, media_1fase, media_2fase')
            .eq('fase', 'ranking')
            .in('ciclo_nome', ciclos),
        ])
      : [{ data: [] as any[] }]

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

  async function loadTurmaQuestoes() {
    const { data } = await supabase.from('resultados')
      .select('id_aluno, ciclo_nome, fase, notas_questoes')
      .neq('fase', 'ranking')
      .in('ciclo_nome', ciclosDoAluno)
      .not('notas_questoes', 'is', null)
    setTurmaQuestoes(data || [])
    setTurmaQuestoesLoaded(true)
  }

  const nomeAluno = alunoInfo?.nome || perfil?.nome || '...'
  const rankings = dados.filter(r => r.fase === 'ranking')
  const ciclos = [...new Set(rankings.map(r => r.ciclo_nome))].sort((a: string, b: string) =>
    parseInt(a.match(/\d+/)?.[0] || '0') - parseInt(b.match(/\d+/)?.[0] || '0')
  )
  const rankingAtivo = rankings.find(r => r.ciclo_nome === cicloAtivo)

  // Ranking geral
  function mediaAluno(alunoId: string) {
    const rs = todos.filter(r => r.id_aluno === alunoId)
    if (!rs.length) return 0
    const vals = rs.map(r => {
      const m1 = Number(r.media_1fase || 0)
      const m2 = Number(r.media_2fase || 0)
      return m1 && m2 ? (m1 + m2) / 2 : m1 || m2
    })
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

  // Média geral do aluno
  const mediaGeralAluno = mediaAluno(targetId)

  // Notas por ciclo para gráfico de evolução
  function corNota(n: number) { return n >= 7 ? '#16A34A' : n >= 5 ? '#D97706' : '#DC2626' }

  function NotaBar({ nota, label }: { nota: number, label: string }) {
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
    const cor = CORES_MAT[materia] || '#2563EB'
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
          <polygon points={polyPath} fill="#2563EB" fillOpacity="0.15" stroke="#2563EB" strokeWidth="2" />
          {/* Pontos */}
          {pontos.map(([x, y], i) => {
            const cor = (CORES_MAT as any)[dados[i].materia] || '#2563EB'
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
            const cor = (CORES_MAT as any)[d.materia] || '#2563EB'
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
          <Link href="/dados-pessoais" style={{ textDecoration: 'none', fontSize: 11, color: '#2563EB', border: '0.5px solid #2563EB', borderRadius: 8, padding: '5px 10px' }}>
            ✎ Meus dados
          </Link>
        )}
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 4, padding: '8px 16px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
        {[
          { id: 'geral', label: 'Visão geral' },
          { id: 'simulados', label: 'Simulados' },
          { id: 'listas', label: 'Listas' },
        ].map(a => (
          <button key={a.id} onClick={() => setAba(a.id as any)} style={{
            padding: '5px 14px', borderRadius: 16, fontSize: 11, border: 'none',
            background: aba === a.id ? '#2563EB' : '#F1F5F9',
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
                    <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 600, color: '#1E40AF' }}>
                      {nomeAluno.split(' ').map((w: string) => w[0]).slice(0, 2).join('')}
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{nomeAluno}</div>
                  <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>ID: {targetId?.slice(0, 8)}</div>
                  {perfil?.modalidade && (
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#EFF6FF', color: '#1E40AF', marginTop: 4, display: 'inline-block' }}>
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
                <div style={{ fontSize: 28, fontWeight: 700, color: '#2563EB' }}>#{posicaoGeral}</div>
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
                      <span style={{ fontWeight: 600, color: '#2563EB' }}>#{pos}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Radar de desempenho */}
            {rankings.length > 0 && (
              <RadarSection rankings={rankings} CORES_MAT={CORES_MAT} />
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
                  background: cicloAtivo === c ? '#2563EB' : 'transparent', color: cicloAtivo === c ? 'white' : '#666',
                  cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'DM Sans,sans-serif'
                }}>{c.replace('Ciclo ', 'C').replace(' - ITA', '').replace(' - IME', '')}</button>
              ))}
            </div>

            {rankingAtivo && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 11, color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{cicloAtivo}</span>
                  <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 10, fontWeight: 500,
                    background: rankingAtivo.resultado_ciclo === 'Aprovado' ? '#DCFCE7' : '#FEF2F2',
                    color: rankingAtivo.resultado_ciclo === 'Aprovado' ? '#14532D' : '#991B1B' }}>
                    {rankingAtivo.resultado_ciclo === 'Aprovado' ? '✓ Aprovado' : '✗ Reprovado'}
                  </span>
                </div>

                <div className="card" style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12 }}>Notas do ciclo</div>
                  {rankingAtivo.media_1fase !== null && <NotaBar nota={Number(rankingAtivo.media_1fase)} label="1ª Fase" />}
                  {rankingAtivo.nota_matematica !== null && <NotaBar nota={Number(rankingAtivo.nota_matematica)} label="Matemática (2ª fase)" />}
                  {rankingAtivo.nota_fisica !== null && <NotaBar nota={Number(rankingAtivo.nota_fisica)} label="Física (2ª fase)" />}
                  {rankingAtivo.nota_quimica !== null && <NotaBar nota={Number(rankingAtivo.nota_quimica)} label="Química (2ª fase)" />}
                  {rankingAtivo.media_linguagens !== null && <NotaBar nota={Number(rankingAtivo.media_linguagens)} label="Port./Redação (2ª fase)" />}
                  {rankingAtivo.media_2fase !== null && (
                    <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.06)', marginTop: 10, paddingTop: 10 }}>
                      <NotaBar nota={Number(rankingAtivo.media_2fase)} label="Média 2ª Fase" />
                    </div>
                  )}
                </div>

                {/* Diagnóstico de corte ITA / IME */}
                <DiagnosticoCorte dados={dados} rankingAtivo={rankingAtivo} cicloAtivo={cicloAtivo} />

                {/* Gráficos de acertos por questão */}
                <div className="card" style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Acertos por questão — 1ª Fase</div>
                  <GraficoQuestoes dados={dados} turmaQuestoes={turmaQuestoes} cicloAtivo={cicloAtivo} fase="1fase" titulo="1ª Fase" corAluno="#2563EB" />
                </div>

                {/* Radar comparativo por questão — dissertativas */}
                <div className="card" style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Análise comparada — dissertativas</div>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 14 }}>Desempenho por questão: aluno, média e top 25% da turma</div>
                  <RadarQuestoesChart dados={dados} turmaQuestoes={turmaQuestoes} cicloAtivo={cicloAtivo} fase="2fase_mat" titulo="Matemática" corAluno="#2563EB" />
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
              {[
                { label: 'Matemática', campo: 'nota_matematica' },
                { label: 'Física', campo: 'nota_fisica' },
                { label: 'Química', campo: 'nota_quimica' },
                { label: 'Port./Redação', campo: 'media_linguagens' },
                { label: '1ª Fase', campo: 'media_1fase' },
              ].map(({ label, campo }) => {
                const vals = rankings.map(r => Number(r[campo])).filter(v => v > 0)
                if (!vals.length) return null
                const media = vals.reduce((a, b) => a + b, 0) / vals.length
                return <NotaBar key={campo} nota={media} label={label} />
              })}
            </div>
          </>
        )}

        {/* === ABA LISTAS === */}
        {aba === 'listas' && (
          <ListasPage alunoId={targetId} />
        )}
      </div>
      <Nav />
    </div>
  )
}


function GraficoQuestoes({ dados, turmaQuestoes, cicloAtivo, fase, titulo, corAluno, corBom, corMedio, corRuim }: any) {
  // cicloAtivo pode ser "Ciclo 1" ou "Ranking Ciclo 1" — extrai o número
  const cicloNum = String(cicloAtivo || '').match(/\d+/)?.[0] || ''
  if (!cicloNum) return null

  // Pega dados do aluno para essa fase/ciclo
  // dados contém registros de todas as fases do aluno
  // cicloAtivo pode ser "Ranking Ciclo 1" ou "Ciclo 1"
  const regAluno = dados.find((r: any) => {
    const cn = String(r.ciclo_nome || '')
    const num = cn.match(/\d+/)?.[0] || ''
    return num === cicloNum && r.fase === fase
  })
  if (!regAluno?.notas_questoes) return null

  const questoesAluno = regAluno.notas_questoes as Record<string, number>
  const questoes = Object.keys(questoesAluno).sort((a, b) => {
    const na = parseInt(a.replace('Q', ''))
    const nb = parseInt(b.replace('Q', ''))
    return na - nb
  })

  if (!questoes.length) return null

  // Calcula média da turma por questão
  const registrosTurma = turmaQuestoes.filter((r: any) => {
    const cn = String(r.ciclo_nome || '')
    const num = cn.match(/\d+/)?.[0] || ''
    return num === cicloNum && r.fase === fase && r.notas_questoes
  })

  const mediaTurma: Record<string, number> = {}
  questoes.forEach(q => {
    const vals = registrosTurma
      .map((r: any) => r.notas_questoes?.[q])
      .filter((v: any) => v !== null && v !== undefined)
    mediaTurma[q] = vals.length ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : 0
  })

  const barW = Math.max(8, Math.min(20, Math.floor(320 / questoes.length)))
  const gap = 2
  const totalW = questoes.length * (barW * 2 + gap + 4)
  const h = 100
  const padT = 16
  const padB = 20

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>{titulo}</div>
      <div style={{ display: 'flex', gap: 12, fontSize: 10, color: '#666', marginBottom: 6 }}>
        <span style={{ color: corAluno, fontWeight: 600 }}><span style={{ display: 'inline-block', width: 10, height: 10, background: corAluno, borderRadius: 2, marginRight: 4 }} />Aluno</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#D0D0D0', borderRadius: 2, marginRight: 4 }} />Turma</span>
      </div>
      <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
        <svg viewBox={`0 0 ${Math.max(totalW, 300)} ${padT + h + padB}`} width={Math.max(totalW, 300)} height={padT + h + padB} style={{ display: 'block' }}>
          {/* Linhas de referência */}
          {[0.25, 0.5, 0.75, 1.0].map(v => (
            <g key={v}>
              <line x1="0" y1={padT + h - v * h} x2={Math.max(totalW, 300)} y2={padT + h - v * h} stroke="rgba(0,0,0,0.06)" strokeWidth="1" />
              <text x="2" y={padT + h - v * h - 2} fontSize="7" fill="#bbb">{(v * 100).toFixed(0)}%</text>
            </g>
          ))}

          {questoes.map((q, i) => {
            const vAluno = questoesAluno[q] ?? 0
            const vTurma = mediaTurma[q] ?? 0
            const x = i * (barW * 2 + gap + 4) + 2
            const hAluno = vAluno * h
            const hTurma = vTurma * h
            const corBarra = corAluno || '#2563EB'
            const pctTurma = Math.round(vTurma * 100)

            return (
              <g key={q}>
                {/* Barra turma — só mostra se há dados da turma */}
                {registrosTurma.length > 0 && (
                  <rect x={x} y={h - Math.max(hTurma, 1)} width={barW} height={Math.max(hTurma, 1)} fill="#D0D0D0" rx="2" />
                )}
                {registrosTurma.length > 0 && pctTurma > 0 ? (
                  <text x={x + barW/2} y={h - hTurma - 2} textAnchor="middle" fontSize="7" fill="#999">{pctTurma}%</text>
                ) : null}
                {/* Barra aluno */}
                <rect x={registrosTurma.length > 0 ? x + barW + gap : x + barW/2} y={h - Math.max(hAluno, 1)} width={barW} height={Math.max(hAluno, 1)} fill={corBarra} rx="2" />
                <text x={registrosTurma.length > 0 ? x + barW + gap + barW/2 : x + barW} y={h - hAluno - 2} textAnchor="middle" fontSize="7" fill={corBarra}>{Math.round(vAluno * 100)}%</text>
                {/* Label questão */}
                <text x={x + barW} y={h + padB - 4} textAnchor="middle" fontSize="7" fill="#999">
                  {q.replace('Q', '')}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

// ─── Semáforo de risco ────────────────────────────────────────────────────────

function calcularRisco(dados: any[], rankingAtivo: any, cicloAtivo: string | null) {
  if (!rankingAtivo || !cicloAtivo) return null
  const concurso: string | null = rankingAtivo.concurso
    || (String(cicloAtivo).includes('ITA') ? 'ITA' : String(cicloAtivo).includes('IME') ? 'IME' : null)
  if (concurso !== 'ITA' && concurso !== 'IME') return null

  const n = (v: any): number | null => v !== null && v !== undefined ? Number(v) : null
  const cicloNum = String(cicloAtivo).match(/\d+/)?.[0] || ''
  const reg1f = dados.find(r =>
    String(r.ciclo_nome || '').match(/\d+/)?.[0] === cicloNum && r.fase === '1fase'
  )

  type C = { label: string; val: number; min: number; ac?: boolean }
  const c1: C[] = [], c2: C[] = []

  if (concurso === 'ITA') {
    if (reg1f?.acertos_mat_1f != null) c1.push({ label: 'Mat.', val: +reg1f.acertos_mat_1f, min: 5, ac: true })
    if (reg1f?.acertos_fis_1f != null) c1.push({ label: 'Fís.', val: +reg1f.acertos_fis_1f, min: 5, ac: true })
    if (reg1f?.acertos_qui_1f != null) c1.push({ label: 'Quí.', val: +reg1f.acertos_qui_1f, min: 5, ac: true })
    if (reg1f?.acertos_ing_1f != null) c1.push({ label: 'Ing.', val: +reg1f.acertos_ing_1f, min: 5, ac: true })
    if (n(rankingAtivo.media_1fase) !== null) c1.push({ label: 'Média 1ª', val: n(rankingAtivo.media_1fase)!, min: 5 })
    if (n(rankingAtivo.nota_matematica) !== null) c2.push({ label: 'Mat.', val: n(rankingAtivo.nota_matematica)!, min: 4 })
    if (n(rankingAtivo.nota_fisica) !== null) c2.push({ label: 'Fís.', val: n(rankingAtivo.nota_fisica)!, min: 4 })
    if (n(rankingAtivo.nota_quimica) !== null) c2.push({ label: 'Quí.', val: n(rankingAtivo.nota_quimica)!, min: 4 })
    if (n(rankingAtivo.media_linguagens) !== null) c2.push({ label: 'Port.', val: n(rankingAtivo.media_linguagens)!, min: 4 })
    if (n(rankingAtivo.media_2fase) !== null) c2.push({ label: 'Média 2ª', val: n(rankingAtivo.media_2fase)!, min: 5 })
  } else {
    if (reg1f?.acertos_mat_1f != null) c1.push({ label: 'Mat.', val: +reg1f.acertos_mat_1f, min: 6, ac: true })
    if (reg1f?.acertos_fis_1f != null) c1.push({ label: 'Fís.', val: +reg1f.acertos_fis_1f, min: 6, ac: true })
    if (reg1f?.acertos_qui_1f != null) c1.push({ label: 'Quí.', val: +reg1f.acertos_qui_1f, min: 4, ac: true })
    if (n(rankingAtivo.media_1fase) !== null) c1.push({ label: 'Total', val: n(rankingAtivo.media_1fase)!, min: 5 })
    if (n(rankingAtivo.nota_matematica) !== null) c2.push({ label: 'Mat.', val: n(rankingAtivo.nota_matematica)!, min: 4 })
    if (n(rankingAtivo.nota_fisica) !== null) c2.push({ label: 'Fís.', val: n(rankingAtivo.nota_fisica)!, min: 4 })
    if (n(rankingAtivo.nota_quimica) !== null) c2.push({ label: 'Quí.', val: n(rankingAtivo.nota_quimica)!, min: 4 })
    if (n(rankingAtivo.media_linguagens) !== null) c2.push({ label: 'Port.', val: n(rankingAtivo.media_linguagens)!, min: 4 })
  }

  if (!c1.length && !c2.length) return null

  const falhas1 = c1.filter(c => c.val < c.min)
  const falhas2 = c2.filter(c => c.val < c.min)
  const cortado: '1ª Fase' | '2ª Fase' | null = falhas1.length ? '1ª Fase' : falhas2.length ? '2ª Fase' : null

  const borda = !cortado && [...c1, ...c2].some(c =>
    c.val >= c.min && (c.ac ? c.val - c.min <= 1 : c.val - c.min <= 0.5)
  )

  const falhasTexto = (cortado === '1ª Fase' ? falhas1 : falhas2)
    .map(c => `${c.label} (${c.ac ? c.val : c.val.toFixed(1)} < ${c.ac ? c.min : c.min.toFixed(1)})`)
    .join(' · ')

  const bordaTexto = borda ? [...c1, ...c2]
    .filter(c => c.val >= c.min && (c.ac ? c.val - c.min <= 1 : c.val - c.min <= 0.5))
    .map(c => c.label).join(', ') : ''

  return { concurso, cortado, borda, falhasTexto, bordaTexto }
}

function BannerRisco({ dados, rankingAtivo, cicloAtivo }: { dados: any[], rankingAtivo: any, cicloAtivo: string | null }) {
  const r = calcularRisco(dados, rankingAtivo, cicloAtivo)
  if (!r) return null

  const isCortado = !!r.cortado
  const bg = isCortado ? '#FEF2F2' : r.borda ? '#FFFBEB' : '#DCFCE7'
  const bordaCor = isCortado ? '#DC2626' : r.borda ? '#D97706' : '#16A34A'
  const cor = isCortado ? '#991B1B' : r.borda ? '#78350F' : '#14532D'
  const icon = isCortado ? '🔴' : r.borda ? '🟡' : '🟢'
  const titulo = isCortado
    ? `Cortado na ${r.cortado} · ${r.concurso}`
    : r.borda ? `Próximo do corte · ${r.concurso}`
    : `Aprovado em todos os critérios · ${r.concurso}`

  return (
    <div style={{ background: bg, borderLeft: `4px solid ${bordaCor}`, borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: cor }}>{titulo}</span>
      </div>
      {isCortado && r.falhasTexto && (
        <div style={{ fontSize: 11, color: cor, marginTop: 4, marginLeft: 24 }}>{r.falhasTexto}</div>
      )}
      {!isCortado && r.borda && r.bordaTexto && (
        <div style={{ fontSize: 11, color: cor, marginTop: 4, marginLeft: 24 }}>No limite: {r.bordaTexto}</div>
      )}
    </div>
  )
}

// ─── Critérios de corte detalhados ────────────────────────────────────────────

type CriterioCorte = {
  label: string
  valor: number | null
  minimo: number
  escala: number
  isAcertos?: boolean
}

function ItemCorte({ c }: { c: CriterioCorte }) {
  if (c.valor === null) return null
  const passou = c.valor >= c.minimo
  const cor = passou ? '#16A34A' : '#DC2626'
  const bgCor = passou ? '#DCFCE7' : '#FEF2F2'
  const diff = Math.abs(c.valor - c.minimo)
  const pctValor = Math.min((c.valor / c.escala) * 100, 100)
  const pctMin = Math.min((c.minimo / c.escala) * 100, 100)

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, color: cor, fontWeight: 700 }}>{passou ? '✓' : '✗'}</span>
          <span style={{ fontSize: 12, color: '#444' }}>{c.label}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: '#bbb' }}>mín. {c.isAcertos ? c.minimo : c.minimo.toFixed(1)}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: cor, background: bgCor, padding: '2px 8px', borderRadius: 8 }}>
            {c.isAcertos ? c.valor : c.valor.toFixed(1)}
            {c.isAcertos && <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 2 }}>ac.</span>}
          </span>
        </div>
      </div>
      <div style={{ position: 'relative', height: 6, background: '#F1F5F9', borderRadius: 3 }}>
        <div style={{ height: '100%', width: `${pctValor}%`, background: cor, borderRadius: 3, transition: 'width 0.5s' }} />
        <div style={{ position: 'absolute', top: -2, bottom: -2, left: `${pctMin}%`, width: 2, background: 'rgba(0,0,0,0.35)', borderRadius: 1 }} />
      </div>
      <div style={{ fontSize: 10, color: passou ? '#16A34A' : '#DC2626', marginTop: 3, textAlign: 'right' }}>
        {passou
          ? `+${c.isAcertos ? diff : diff.toFixed(1)} acima do mínimo`
          : `−${c.isAcertos ? diff : diff.toFixed(1)} abaixo do mínimo`}
      </div>
    </div>
  )
}

function DiagnosticoCorte({ dados, rankingAtivo, cicloAtivo }: { dados: any[], rankingAtivo: any, cicloAtivo: string | null }) {
  if (!rankingAtivo || !cicloAtivo) return null

  const concurso: string | null = rankingAtivo.concurso
    || (cicloAtivo.includes('ITA') ? 'ITA' : cicloAtivo.includes('IME') ? 'IME' : null)
  if (concurso !== 'ITA' && concurso !== 'IME') return null

  const cicloNum = String(cicloAtivo).match(/\d+/)?.[0] || ''
  const reg1f = dados.find(r => {
    const num = String(r.ciclo_nome || '').match(/\d+/)?.[0] || ''
    return num === cicloNum && r.fase === '1fase'
  })

  const criterios1f: CriterioCorte[] = []
  const criterios2f: CriterioCorte[] = []

  const n = (v: any) => v !== null && v !== undefined ? Number(v) : null

  if (concurso === 'ITA') {
    // 1ª fase: mínimo 5 acertos por disciplina
    const maxAc = 10
    if (reg1f?.acertos_mat_1f != null) criterios1f.push({ label: 'Matemática', valor: n(reg1f.acertos_mat_1f), minimo: 5, escala: maxAc, isAcertos: true })
    if (reg1f?.acertos_fis_1f != null) criterios1f.push({ label: 'Física', valor: n(reg1f.acertos_fis_1f), minimo: 5, escala: maxAc, isAcertos: true })
    if (reg1f?.acertos_qui_1f != null) criterios1f.push({ label: 'Química', valor: n(reg1f.acertos_qui_1f), minimo: 5, escala: maxAc, isAcertos: true })
    if (reg1f?.acertos_ing_1f != null) criterios1f.push({ label: 'Inglês', valor: n(reg1f.acertos_ing_1f), minimo: 5, escala: maxAc, isAcertos: true })
    if (n(rankingAtivo.media_1fase) !== null) criterios1f.push({ label: 'Média geral', valor: n(rankingAtivo.media_1fase), minimo: 5.0, escala: 10 })

    // 2ª fase: mínimo 4.0 por disciplina + média final ≥ 5.0
    if (n(rankingAtivo.nota_matematica) !== null) criterios2f.push({ label: 'Matemática', valor: n(rankingAtivo.nota_matematica), minimo: 4.0, escala: 10 })
    if (n(rankingAtivo.nota_fisica) !== null) criterios2f.push({ label: 'Física', valor: n(rankingAtivo.nota_fisica), minimo: 4.0, escala: 10 })
    if (n(rankingAtivo.nota_quimica) !== null) criterios2f.push({ label: 'Química', valor: n(rankingAtivo.nota_quimica), minimo: 4.0, escala: 10 })
    if (n(rankingAtivo.media_linguagens) !== null) criterios2f.push({ label: 'Port./Redação', valor: n(rankingAtivo.media_linguagens), minimo: 4.0, escala: 10 })
    if (n(rankingAtivo.media_2fase) !== null) criterios2f.push({ label: 'Média final', valor: n(rankingAtivo.media_2fase), minimo: 5.0, escala: 10 })
  }

  if (concurso === 'IME') {
    // 1ª fase: Mat ≥ 6, Fís ≥ 6, Quí ≥ 4, total ≥ 20/40 (≈ média ≥ 5)
    if (reg1f?.acertos_mat_1f != null) criterios1f.push({ label: 'Matemática', valor: n(reg1f.acertos_mat_1f), minimo: 6, escala: 15, isAcertos: true })
    if (reg1f?.acertos_fis_1f != null) criterios1f.push({ label: 'Física', valor: n(reg1f.acertos_fis_1f), minimo: 6, escala: 15, isAcertos: true })
    if (reg1f?.acertos_qui_1f != null) criterios1f.push({ label: 'Química', valor: n(reg1f.acertos_qui_1f), minimo: 4, escala: 10, isAcertos: true })
    if (n(rankingAtivo.media_1fase) !== null) criterios1f.push({ label: 'Total (≥ 20/40)', valor: n(rankingAtivo.media_1fase), minimo: 5.0, escala: 10 })

    // 2ª fase: mínimo 4.0 por disciplina
    if (n(rankingAtivo.nota_matematica) !== null) criterios2f.push({ label: 'Matemática', valor: n(rankingAtivo.nota_matematica), minimo: 4.0, escala: 10 })
    if (n(rankingAtivo.nota_fisica) !== null) criterios2f.push({ label: 'Física', valor: n(rankingAtivo.nota_fisica), minimo: 4.0, escala: 10 })
    if (n(rankingAtivo.nota_quimica) !== null) criterios2f.push({ label: 'Química', valor: n(rankingAtivo.nota_quimica), minimo: 4.0, escala: 10 })
    if (n(rankingAtivo.media_linguagens) !== null) criterios2f.push({ label: 'Port./Redação', valor: n(rankingAtivo.media_linguagens), minimo: 4.0, escala: 10 })
  }

  if (!criterios1f.length && !criterios2f.length) return null

  const falhou1f = criterios1f.filter(c => c.valor !== null && c.valor < c.minimo)
  const falhou2f = criterios2f.filter(c => c.valor !== null && c.valor < c.minimo)
  const cortadoEm = falhou1f.length > 0 ? '1ª Fase' : falhou2f.length > 0 ? '2ª Fase' : null
  const passou = !cortadoEm

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Critérios de corte — {concurso}</div>
        <span style={{
          fontSize: 11, padding: '3px 10px', borderRadius: 10, fontWeight: 600,
          background: passou ? '#DCFCE7' : '#FEF2F2',
          color: passou ? '#14532D' : '#991B1B',
        }}>
          {passou ? '✓ Passou em tudo' : `✗ Cortado na ${cortadoEm}`}
        </span>
      </div>

      {!passou && (
        <div style={{ background: '#FFF7F7', border: '1px solid #F5C6C6', borderRadius: 10, padding: '10px 12px', marginBottom: 14, fontSize: 12, color: '#991B1B' }}>
          {cortadoEm === '1ª Fase'
            ? `Eliminado na 1ª fase: ${falhou1f.map(c => c.label).join(', ')}`
            : `Eliminado na 2ª fase: ${falhou2f.map(c => `${c.label} (${c.valor?.toFixed(1)} < ${c.minimo.toFixed(1)})`).join(' · ')}`}
        </div>
      )}

      {criterios1f.length > 0 && (
        <div style={{ marginBottom: criterios2f.length ? 14 : 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            1ª Fase
          </div>
          {criterios1f.map((c, i) => <ItemCorte key={i} c={c} />)}
        </div>
      )}

      {criterios2f.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            2ª Fase
          </div>
          {criterios2f.map((c, i) => <ItemCorte key={i} c={c} />)}
        </div>
      )}
    </div>
  )
}

function RadarQuestoesChart({ dados, turmaQuestoes, cicloAtivo, fase, titulo, corAluno }: any) {
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const cicloNum = String(cicloAtivo || '').match(/\d+/)?.[0] || ''
  if (!cicloNum) return null

  const regAluno = dados.find((r: any) => {
    const num = String(r.ciclo_nome || '').match(/\d+/)?.[0] || ''
    return num === cicloNum && r.fase === fase
  })
  if (!regAluno?.notas_questoes) return null

  const questoesAluno = regAluno.notas_questoes as Record<string, number>
  const questoes = Object.keys(questoesAluno).sort((a, b) => {
    return parseInt(a.replace(/\D/g, '')) - parseInt(b.replace(/\D/g, ''))
  })
  if (!questoes.length) return null

  const registrosTurma = turmaQuestoes.filter((r: any) => {
    const num = String(r.ciclo_nome || '').match(/\d+/)?.[0] || ''
    return num === cicloNum && r.fase === fase && r.notas_questoes
  })

  const mediaTurma: Record<string, number> = {}
  const top25Turma: Record<string, number> = {}

  questoes.forEach(q => {
    const vals = registrosTurma
      .map((r: any) => r.notas_questoes?.[q])
      .filter((v: any) => v !== null && v !== undefined)
      .map(Number)
      .sort((a: number, b: number) => b - a)

    mediaTurma[q] = vals.length ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : 0

    if (vals.length > 0) {
      const top25Count = Math.max(1, Math.ceil(vals.length * 0.25))
      const top25Vals = vals.slice(0, top25Count)
      top25Turma[q] = top25Vals.reduce((a: number, b: number) => a + b, 0) / top25Vals.length
    } else {
      top25Turma[q] = 0
    }
  })

  const n = questoes.length
  const cx = 160, cy = 155, raio = 110
  const niveis = [0.25, 0.5, 0.75, 1.0]
  const hasData = registrosTurma.length > 0

  function pontoEixo(idx: number, r: number): [number, number] {
    const angulo = (Math.PI * 2 * idx) / n - Math.PI / 2
    return [cx + r * Math.cos(angulo), cy + r * Math.sin(angulo)]
  }

  function polyPath(vals: Record<string, number>) {
    return questoes.map((q, i) => {
      const [x, y] = pontoEixo(i, (Math.min(vals[q] ?? 0, 1)) * raio)
      return `${x},${y}`
    }).join(' ')
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{titulo}</div>
      <div style={{ display: 'flex', gap: 14, fontSize: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 14, height: 3, background: corAluno, borderRadius: 2, display: 'inline-block' }} />
          <span style={{ color: corAluno, fontWeight: 600 }}>Aluno</span>
        </span>
        {hasData && (
          <>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 14, height: 3, background: '#B0B0B0', borderRadius: 2, display: 'inline-block' }} />
              <span style={{ color: '#888' }}>Média turma</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 14, height: 3, background: '#16A34A', borderRadius: 2, display: 'inline-block', borderTop: '1px dashed #16A34A' }} />
              <span style={{ color: '#16A34A' }}>Top 25%</span>
            </span>
          </>
        )}
      </div>
      <svg viewBox="0 0 320 310" width="100%" style={{ maxWidth: 320, display: 'block', margin: '0 auto' }}>
        {/* Grid */}
        {niveis.map(nivel => {
          const ps = questoes.map((_, i) => pontoEixo(i, nivel * raio))
          const path = ps.map(([x, y], j) => `${j === 0 ? 'M' : 'L'}${x},${y}`).join(' ') + 'Z'
          return (
            <g key={nivel}>
              <path d={path} fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth="1" />
              <text x={cx + 3} y={cy - nivel * raio + 3} fontSize="7" fill="#ccc">{(nivel * 100).toFixed(0)}%</text>
            </g>
          )
        })}
        {/* Eixos */}
        {questoes.map((_, i) => {
          const [x, y] = pontoEixo(i, raio)
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(0,0,0,0.07)" strokeWidth="1" />
        })}
        {/* Top 25% */}
        {hasData && (
          <polygon points={polyPath(top25Turma)} fill="#16A34A" fillOpacity="0.08" stroke="#16A34A" strokeWidth="1.5" strokeDasharray="5,3" />
        )}
        {/* Média turma */}
        {hasData && (
          <polygon points={polyPath(mediaTurma)} fill="#B0B0B0" fillOpacity="0.12" stroke="#B0B0B0" strokeWidth="1.5" />
        )}
        {/* Aluno */}
        <polygon points={polyPath(questoesAluno)} fill={corAluno} fillOpacity="0.18" stroke={corAluno} strokeWidth="2" />
        {/* Labels questões — clicáveis */}
        {questoes.map((q, i) => {
          const [x, y] = pontoEixo(i, raio + 17)
          const ativo = selecionada === q
          return (
            <text
              key={i} x={x} y={y} textAnchor="middle"
              fontSize={ativo ? '10' : '9'} fontWeight={ativo ? '700' : '600'}
              fill={ativo ? corAluno : '#666'} dominantBaseline="middle"
              style={{ cursor: 'pointer', userSelect: 'none' }}
              onClick={() => setSelecionada(ativo ? null : q)}
            >
              {q}
            </text>
          )
        })}
        {/* Pontos do aluno — clicáveis */}
        {questoes.map((q, i) => {
          const v = Math.min(questoesAluno[q] ?? 0, 1)
          const [x, y] = pontoEixo(i, v * raio)
          const ativo = selecionada === q
          return (
            <circle
              key={i} cx={x} cy={y} r={ativo ? 6 : 4}
              fill={corAluno} stroke="white" strokeWidth={ativo ? 2 : 1.5}
              style={{ cursor: 'pointer' }}
              onClick={() => setSelecionada(ativo ? null : q)}
            />
          )
        })}
      </svg>

      {/* Popup de detalhes — aparece ao clicar numa questão */}
      {selecionada && (
        <div style={{
          marginTop: 10, background: 'white',
          border: `1.5px solid ${corAluno}`, borderRadius: 12,
          padding: '12px 14px', boxShadow: 'var(--shadow-md)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: corAluno }}>{selecionada}</span>
            <button
              onClick={() => setSelecionada(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', fontSize: 15, lineHeight: 1, padding: 2 }}
            >✕</button>
          </div>
          {[
            { label: 'Aluno', val: Math.round((questoesAluno[selecionada] ?? 0) * 100), cor: corAluno, show: true },
            { label: 'Média da turma', val: Math.round((mediaTurma[selecionada] ?? 0) * 100), cor: '#999', show: hasData },
            { label: 'Top 25%', val: Math.round((top25Turma[selecionada] ?? 0) * 100), cor: '#16A34A', show: hasData },
          ].filter(r => r.show).map(({ label, val, cor }) => (
            <div key={label} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                <span style={{ color: '#666' }}>{label}</span>
                <span style={{ fontWeight: 700, color: cor }}>{val}%</span>
              </div>
              <div style={{ height: 5, background: '#F1F5F9', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${val}%`, background: cor, borderRadius: 3 }} />
              </div>
            </div>
          ))}
          <div style={{ fontSize: 10, color: '#bbb', marginTop: 6, textAlign: 'center' }}>
            Toque em outra questão ou em ✕ para fechar
          </div>
        </div>
      )}
    </div>
  )
}

function GraficoEvolucaoLinhas({ rankings }: { rankings: any[] }) {
  const [cicloSel, setCicloSel] = useState<number | null>(null)

  const series = [
    { label: '1ª Fase',    campo: 'media_1fase',      cor: '#64748B' },
    { label: 'Matemática', campo: 'nota_matematica',   cor: '#2563EB' },
    { label: 'Física',     campo: 'nota_fisica',       cor: '#1E88E5' },
    { label: 'Química',    campo: 'nota_quimica',      cor: '#E53935' },
    { label: 'Port./Red.', campo: 'media_linguagens',  cor: '#FB8C00' },
  ].filter(s => rankings.some(r => r[s.campo] != null && Number(r[s.campo]) > 0))

  if (!series.length) return null

  const w = 320, h = 170, pL = 24, pR = 12, pT = 12, pB = 22
  const plotW = w - pL - pR
  const plotH = h - pT - pB

  const xAt = (i: number) =>
    pL + (rankings.length === 1 ? plotW / 2 : (i / (rankings.length - 1)) * plotW)
  const yAt = (v: number) => pT + (1 - v / 10) * plotH

  // Largura da área clicável por ciclo
  const colHW = rankings.length > 1 ? (plotW / (rankings.length - 1)) / 2 : plotW / 2

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: 'block' }}>
        {/* Grid e mínimos */}
        {[2, 4, 5, 6, 8, 10].map(v => (
          <g key={v}>
            <line x1={pL} x2={w - pR} y1={yAt(v)} y2={yAt(v)}
              stroke={v === 4 || v === 5 ? 'rgba(220,38,38,0.25)' : 'rgba(0,0,0,0.06)'}
              strokeWidth={v === 4 || v === 5 ? 1.5 : 1}
              strokeDasharray={v === 4 || v === 5 ? '5,3' : undefined}
            />
            <text x={pL - 3} y={yAt(v) + 3.5} textAnchor="end" fontSize="7"
              fill={v === 4 || v === 5 ? 'rgba(220,38,38,0.55)' : '#ccc'}>{v}</text>
          </g>
        ))}

        {/* Linhas por série */}
        {series.map(s => {
          let d = '', lastValid = false
          rankings.forEach((r, i) => {
            const v = Number(r[s.campo])
            if (!r[s.campo] || v <= 0) { lastValid = false; return }
            d += `${lastValid ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`
            lastValid = true
          })
          return (
            <path key={s.campo} d={d} fill="none" stroke={s.cor} strokeWidth="2"
              strokeLinejoin="round" strokeLinecap="round"
              opacity={cicloSel !== null ? 0.35 : 1} />
          )
        })}

        {/* Linha vertical do ciclo selecionado */}
        {cicloSel !== null && (
          <line
            x1={xAt(cicloSel)} x2={xAt(cicloSel)} y1={pT} y2={pT + plotH}
            stroke="rgba(0,0,0,0.18)" strokeWidth="1.5" strokeDasharray="3,2"
          />
        )}

        {/* Pontos — maiores quando o ciclo está selecionado */}
        {series.map(s =>
          rankings.map((r, i) => {
            const v = Number(r[s.campo])
            if (!r[s.campo] || v <= 0) return null
            const ativo = cicloSel === i
            return (
              <circle key={`${s.campo}-${i}`}
                cx={xAt(i)} cy={yAt(v)}
                r={ativo ? 5 : 3}
                fill={s.cor} stroke="white" strokeWidth={ativo ? 2 : 1.5}
                opacity={cicloSel !== null && !ativo ? 0.25 : 1}
              />
            )
          })
        )}

        {/* Áreas clicáveis invisíveis por ciclo */}
        {rankings.map((_, i) => (
          <rect key={i}
            x={xAt(i) - colHW} y={pT} width={colHW * 2} height={plotH}
            fill="transparent" style={{ cursor: 'pointer' }}
            onClick={() => setCicloSel(i === cicloSel ? null : i)}
          />
        ))}

        {/* Labels eixo X */}
        {rankings.map((r, i) => (
          <text key={i} x={xAt(i)} y={h - 4} textAnchor="middle" fontSize="8"
            fontWeight={cicloSel === i ? '700' : '400'}
            fill={cicloSel === i ? '#1a1a1a' : '#999'}>
            {String(r.ciclo_nome).replace('Ciclo ', 'C').replace(/ - ITA| - IME/g, '')}
          </text>
        ))}
      </svg>

      {/* Legenda compacta */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 12px', fontSize: 10, marginTop: 6 }}>
        {series.map(s => (
          <span key={s.campo} style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#888' }}>
            <span style={{ width: 12, height: 2.5, background: s.cor, borderRadius: 2, display: 'inline-block', flexShrink: 0 }} />
            {s.label}
          </span>
        ))}
      </div>

      {/* Painel de detalhes do ciclo selecionado */}
      {cicloSel !== null ? (
        <div style={{ marginTop: 10, background: '#F8FAFC', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#1a1a1a' }}>
              {String(rankings[cicloSel].ciclo_nome).replace(/ - ITA| - IME/g, '')}
            </span>
            <button onClick={() => setCicloSel(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', fontSize: 14, lineHeight: 1, padding: 2 }}>
              ✕
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
            {series.map(s => {
              const v = Number(rankings[cicloSel][s.campo])
              if (!rankings[cicloSel][s.campo] || v <= 0) return null
              const cor = v >= 7 ? '#16A34A' : v >= 5 ? '#D97706' : '#DC2626'
              return (
                <div key={s.campo} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#666' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.cor, display: 'inline-block', flexShrink: 0 }} />
                    {s.label}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: cor }}>{v.toFixed(1)}</span>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 10, color: '#bbb', marginTop: 8, textAlign: 'center' }}>
          Toque num ciclo para ver as notas
        </div>
      )}
    </div>
  )
}

function RadarSection({ rankings, CORES_MAT }: { rankings: any[], CORES_MAT: Record<string, string> }) {
  const [modo, setModo] = useState<'media' | 'recente'>('media')

  const campos = [
    { label: 'Matemática', campo: 'nota_matematica' },
    { label: 'Física', campo: 'nota_fisica' },
    { label: 'Química', campo: 'nota_quimica' },
    { label: 'Port./Red.', campo: 'media_linguagens' },
  ]

  const dadosMedia = campos.map(({ label, campo }) => {
    const vals = rankings.map(r => Number(r[campo])).filter(v => v > 0)
    return { materia: label, nota: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0 }
  }).filter(d => d.nota > 0)

  const ultimoRanking = rankings[rankings.length - 1]
  const dadosRecente = campos.map(({ label, campo }) => ({
    materia: label, nota: Number(ultimoRanking?.[campo] || 0)
  })).filter(d => d.nota > 0)

  const dadosRadar = modo === 'media' ? dadosMedia : dadosRecente
  const n = dadosRadar.length
  const cx = 150, cy = 150, raio = 100
  const max = 10
  const niveis = [2, 4, 6, 8, 10]

  function pontoEixo(idx: number, r: number): [number, number] {
    const angulo = (Math.PI * 2 * idx) / n - Math.PI / 2
    return [cx + r * Math.cos(angulo), cy + r * Math.sin(angulo)]
  }

  const pontos = dadosRadar.map((d, i) => pontoEixo(i, (d.nota / max) * raio))
  const polyPath = pontos.map(([x, y]) => `${x},${y}`).join(' ')

  if (!dadosRadar.length) return null

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Perfil por matéria</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['media', 'recente'] as const).map(m => (
            <button key={m} onClick={() => setModo(m)} style={{
              padding: '3px 10px', borderRadius: 12, fontSize: 10, border: 'none',
              background: modo === m ? '#2563EB' : '#F1F5F9',
              color: modo === m ? 'white' : '#666',
              cursor: 'pointer', fontFamily: 'DM Sans,sans-serif'
            }}>{m === 'media' ? 'Média geral' : 'Último ciclo'}</button>
          ))}
        </div>
      </div>
      <svg viewBox="0 0 300 300" width="100%" style={{ maxWidth: 300, margin: '0 auto', display: 'block' }}>
        {niveis.map(nivel => {
          const ps = dadosRadar.map((_, i) => pontoEixo(i, (nivel / max) * raio))
          const path = ps.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ') + 'Z'
          return <path key={nivel} d={path} fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth="1" />
        })}
        {dadosRadar.map((_, i) => {
          const [x, y] = pontoEixo(i, raio)
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(0,0,0,0.07)" strokeWidth="1" />
        })}
        <polygon points={polyPath} fill="#2563EB" fillOpacity="0.15" stroke="#2563EB" strokeWidth="2" />
        {pontos.map(([x, y], i) => {
          const cor = CORES_MAT[dadosRadar[i].materia] || '#2563EB'
          return (
            <g key={i}>
              <circle cx={x} cy={y} r="5" fill={cor} stroke="white" strokeWidth="1.5" />
              <text x={x} y={y - 9} textAnchor="middle" fontSize="9" fontWeight="700" fill={cor}>
                {dadosRadar[i].nota.toFixed(1)}
              </text>
            </g>
          )
        })}
        {dadosRadar.map((d, i) => {
          const [x, y] = pontoEixo(i, raio + 20)
          const cor = CORES_MAT[d.materia] || '#2563EB'
          return (
            <text key={i} x={x} y={y} textAnchor="middle" fontSize="10" fontWeight="600" fill={cor} dominantBaseline="middle">
              {d.materia}
            </text>
          )
        })}
        {niveis.map(nivel => (
          <text key={nivel} x={cx + 3} y={cy - (nivel / max) * raio + 3} fontSize="7" fill="#ccc">{nivel}</text>
        ))}
      </svg>
    </div>
  )
}
