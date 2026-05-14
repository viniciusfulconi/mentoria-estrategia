'use client'
import ListasPage from '@/app/listas/page'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Nav from '@/components/Nav'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'

import { CORES_MATERIA as CORES_MAT_IMPORT } from '@/lib/cores'
const CORES_MAT: Record<string, string> = {
  ...CORES_MAT_IMPORT,
  'Português/Redação': '#FB8C00',
}

function BarChart({ dados }: { dados: { materia: string, pct: number }[] }) {
  if (!dados.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {dados.map(({ materia, pct }) => {
        const cor = CORES_MAT[materia] || '#534AB7'
        return (
          <div key={materia}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
              <span style={{ color: '#666' }}>{materia}</span>
              <span style={{ fontWeight: 600, color: cor }}>{pct}%</span>
            </div>
            <div style={{ height: 8, background: '#F0EEE8', borderRadius: 4, overflow: 'hidden' }}>
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
  const [cicloAtivo, setCicloAtivo] = useState<string | null>(null)
  const [aba, setAba] = useState<'geral' | 'simulados' | 'listas'>('geral')
  const [loading, setLoading] = useState(true)

  // Para aluno, usa o próprio id
  const targetId = meuPerfil?.papel === 'aluno' ? meuPerfil.aluno_id! : id

  useEffect(() => {
    if (!targetId) return
    load()
  }, [targetId])

  async function load() {
    const [
      { data: resultados },
      { data: perfilData },
      { data: alunoData },
      { data: ts },
      { data: ps },
      { data: todosRanking },
      { data: turmaQ },
    ] = await Promise.all([
      supabase.from('resultados').select('*').eq('id_aluno', targetId).order('ciclo_nome'),
      supabase.from('perfis').select('*').eq('aluno_id', targetId).single(),
      supabase.from('alunos_dados').select('*').eq('id_aluno', targetId).single(),
      supabase.from('topicos').select('*'),
      supabase.from('progresso_topicos').select('*').eq('aluno_id', targetId),
      supabase.from('resultados').select('id_aluno, nome_aluno, nota_matematica, nota_fisica, nota_quimica, media_linguagens, media_1fase, media_2fase').eq('fase', 'ranking'),
      supabase.from('resultados').select('id_aluno, ciclo_nome, fase, notas_questoes').neq('fase', 'ranking'),
    ])

    setDados(resultados || [])
    setPerfil(perfilData)
    setAlunoInfo(alunoData)
    setTopicos(ts || [])
    setProgressos(ps || [])
    setTodos(todosRanking || [])
    setTurmaQuestoes(turmaQ || [])

    const rankings = (resultados || []).filter(r => r.fase === 'ranking')
      .sort((a, b) => (a.ciclo_nome || '').localeCompare(b.ciclo_nome || ''))
    if (rankings.length) setCicloAtivo(rankings[rankings.length - 1].ciclo_nome)
    setLoading(false)
  }

  const nomeAluno = alunoInfo?.nome || perfil?.nome || '...'
  const rankings = dados.filter(r => r.fase === 'ranking')
  const ciclos = [...new Set(rankings.map(r => r.ciclo_nome))].sort()
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
  function corNota(n: number) { return n >= 7 ? '#1D9E75' : n >= 5 ? '#EF9F27' : '#E24B4A' }

  function NotaBar({ nota, label }: { nota: number, label: string }) {
    const cor = corNota(nota)
    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
          <span style={{ color: '#666' }}>{label}</span>
          <span style={{ fontWeight: 600, color: cor }}>{nota.toFixed(1)}</span>
        </div>
        <div style={{ height: 5, background: '#F0EEE8', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${(nota / 10) * 100}%`, background: cor, borderRadius: 3 }} />
        </div>
      </div>
    )
  }

  function PizzaChart({ gabarito, parcial, zero, materia }: { gabarito: number, parcial: number, zero: number, materia: string }) {
    const total = gabarito + parcial + zero
    if (!total) return null
    const cor = CORES_MAT[materia] || '#534AB7'
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
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#EF9F27" strokeWidth={stroke}
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
          <span style={{ fontSize: 11, color: '#EF9F27', display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#EF9F27', display: 'inline-block' }} />
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
          <polygon points={polyPath} fill="#534AB7" fillOpacity="0.15" stroke="#534AB7" strokeWidth="2" />
          {/* Pontos */}
          {pontos.map(([x, y], i) => {
            const cor = (CORES_MAT as any)[dados[i].materia] || '#534AB7'
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
            const cor = (CORES_MAT as any)[d.materia] || '#534AB7'
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
          <Link href="/dados-pessoais" style={{ textDecoration: 'none', fontSize: 11, color: '#534AB7', border: '0.5px solid #534AB7', borderRadius: 8, padding: '5px 10px' }}>
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
            background: aba === a.id ? '#534AB7' : '#F1EFE8',
            color: aba === a.id ? 'white' : '#666',
            cursor: 'pointer', fontFamily: 'DM Sans,sans-serif'
          }}>{a.label}</button>
        ))}
      </div>

      <div style={{ padding: 16 }}>

        {/* === ABA GERAL === */}
        {aba === 'geral' && (
          <>
            {/* Perfil */}
            <div className="card" style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                <div style={{ position: 'relative' }}>
                  {perfil?.foto_url ? (
                    <img src={perfil.foto_url} alt={nomeAluno} style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#EEEDFE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 600, color: '#3C3489' }}>
                      {nomeAluno.split(' ').map((w: string) => w[0]).slice(0, 2).join('')}
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{nomeAluno}</div>
                  <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>ID: {targetId?.slice(0, 8)}</div>
                  {perfil?.modalidade && (
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#EEEDFE', color: '#3C3489', marginTop: 4, display: 'inline-block' }}>
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
                <div style={{ fontSize: 28, fontWeight: 700, color: '#534AB7' }}>#{posicaoGeral}</div>
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
                      <span style={{ fontWeight: 600, color: '#534AB7' }}>#{pos}</span>
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
                  background: cicloAtivo === c ? '#534AB7' : 'transparent', color: cicloAtivo === c ? 'white' : '#666',
                  cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'DM Sans,sans-serif'
                }}>{c.replace('Ciclo ', 'C').replace(' - ITA', '').replace(' - IME', '')}</button>
              ))}
            </div>

            {rankingAtivo && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 11, color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{cicloAtivo}</span>
                  <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 10, fontWeight: 500,
                    background: rankingAtivo.resultado_ciclo === 'Aprovado' ? '#EAF3DE' : '#FCEBEB',
                    color: rankingAtivo.resultado_ciclo === 'Aprovado' ? '#27500A' : '#791F1F' }}>
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

                {/* Gráficos de acertos por questão */}
                <div className="card" style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Acertos por questão vs turma</div>
                  <GraficoQuestoes dados={dados} turmaQuestoes={turmaQuestoes} cicloAtivo={cicloAtivo} fase="1fase" titulo="1ª Fase" corAluno="#534AB7" />
                  <GraficoQuestoes dados={dados} turmaQuestoes={turmaQuestoes} cicloAtivo={cicloAtivo} fase="2fase_mat" titulo="2ª Fase — Matemática" corAluno="#534AB7" corBom="#1D9E75" corMedio="#EF9F27" corRuim="#E24B4A" />
                  <GraficoQuestoes dados={dados} turmaQuestoes={turmaQuestoes} cicloAtivo={cicloAtivo} fase="2fase_fis" titulo="2ª Fase — Física" corAluno="#1E88E5" corBom="#1D9E75" corMedio="#EF9F27" corRuim="#E24B4A" />
                  <GraficoQuestoes dados={dados} turmaQuestoes={turmaQuestoes} cicloAtivo={cicloAtivo} fase="2fase_qui" titulo="2ª Fase — Química" corAluno="#E53935" corBom="#1D9E75" corMedio="#EF9F27" corRuim="#E24B4A" />
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

            {ciclos.length > 1 && (
              <div className="card" style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12 }}>Evolução por ciclo</div>
                {rankings.map(r => {
                  const media = r.media_2fase !== null
                    ? (Number(r.media_1fase || 0) + Number(r.media_2fase || 0)) / 2
                    : Number(r.media_1fase || 0)
                  const cor = r.resultado_ciclo === 'Aprovado' ? '#1D9E75' : '#E24B4A'
                  return (
                    <div key={r.ciclo_nome} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                        <span style={{ color: '#666' }}>{r.ciclo_nome.replace('Ciclo ', 'C').replace(' - ITA', '')}</span>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: r.resultado_ciclo === 'Aprovado' ? '#EAF3DE' : '#FCEBEB', color: r.resultado_ciclo === 'Aprovado' ? '#27500A' : '#791F1F' }}>
                            {r.resultado_ciclo === 'Aprovado' ? '✓' : '✗'}
                          </span>
                          <span style={{ fontWeight: 600, color: cor }}>{media.toFixed(1)}</span>
                        </div>
                      </div>
                      <div style={{ height: 5, background: '#F0EEE8', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(media / 10) * 100}%`, background: cor, borderRadius: 3 }} />
                      </div>
                    </div>
                  )
                })}
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
  const h = 120
  const padB = 20

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>{titulo}</div>
      <div style={{ display: 'flex', gap: 12, fontSize: 10, color: '#666', marginBottom: 6 }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: corAluno, borderRadius: 2, marginRight: 4 }} />Aluno</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#D0D0D0', borderRadius: 2, marginRight: 4 }} />Turma</span>
      </div>
      <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
        <svg viewBox={`0 0 ${Math.max(totalW, 300)} ${h + padB}`} width={Math.max(totalW, 300)} height={h + padB} style={{ display: 'block' }}>
          {/* Linhas de referência */}
          {[0.25, 0.5, 0.75, 1.0].map(v => (
            <g key={v}>
              <line x1="0" y1={h - v * h} x2={Math.max(totalW, 300)} y2={h - v * h} stroke="rgba(0,0,0,0.06)" strokeWidth="1" />
              <text x="2" y={h - v * h - 2} fontSize="7" fill="#bbb">{(v * 100).toFixed(0)}%</text>
            </g>
          ))}

          {questoes.map((q, i) => {
            const vAluno = questoesAluno[q] ?? 0
            const vTurma = mediaTurma[q] ?? 0
            const x = i * (barW * 2 + gap + 4) + 2
            const hAluno = vAluno * h
            const hTurma = vTurma * h
            const corBarra = corBom
                ? (vAluno >= 0.9 ? corBom : vAluno >= 0.5 ? corMedio : corRuim)
                : (vAluno >= 0.9 ? '#1D9E75' : vAluno >= 0.5 ? '#EF9F27' : '#E24B4A')

            return (
              <g key={q}>
                {/* Barra turma */}
                <rect x={x} y={h - hTurma} width={barW} height={hTurma} fill="#D0D0D0" rx="2" />
                {/* Barra aluno */}
                <rect x={x + barW + gap} y={h - hAluno} width={barW} height={hAluno} fill={corBarra} rx="2" />
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
              background: modo === m ? '#534AB7' : '#F1EFE8',
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
        <polygon points={polyPath} fill="#534AB7" fillOpacity="0.15" stroke="#534AB7" strokeWidth="2" />
        {pontos.map(([x, y], i) => {
          const cor = CORES_MAT[dadosRadar[i].materia] || '#534AB7'
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
          const cor = CORES_MAT[d.materia] || '#534AB7'
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
