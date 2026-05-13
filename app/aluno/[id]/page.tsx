'use client'
import ListasPage from '@/app/listas/page'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Nav from '@/components/Nav'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'

const CORES_MAT: Record<string, string> = {
  'Matemática': '#534AB7', 'Física': '#1D9E75', 'Química': '#EF9F27',
  'Português/Redação': '#D85A30', 'Inglês': '#2196F3', 'Biologia': '#8BC34A',
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
    ] = await Promise.all([
      supabase.from('resultados').select('*').eq('id_aluno', targetId).order('ciclo_nome'),
      supabase.from('perfis').select('*').eq('aluno_id', targetId).single(),
      supabase.from('alunos_dados').select('*').eq('id_aluno', targetId).single(),
      supabase.from('topicos').select('*'),
      supabase.from('progresso_topicos').select('*').eq('aluno_id', targetId),
      supabase.from('resultados').select('id_aluno, nome_aluno, nota_matematica, nota_fisica, nota_quimica, media_linguagens, media_1fase, media_2fase').eq('fase', 'ranking'),
    ])

    setDados(resultados || [])
    setPerfil(perfilData)
    setAlunoInfo(alunoData)
    setTopicos(ts || [])
    setProgressos(ps || [])
    setTodos(todosRanking || [])

    const rankings = (resultados || []).filter(r => r.fase === 'ranking')
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
    const r = 40, cx = 50, cy = 50, stroke = 18
    const circ = 2 * Math.PI * r
    const gab = (gabarito / total) * circ
    const par = (parcial / total) * circ
    return (
      <div style={{ textAlign: 'center' }}>
        <svg viewBox="0 0 100 100" width="90" height="90">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#E8E8E8" strokeWidth={stroke} />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#EF9F27" strokeWidth={stroke}
            strokeDasharray={`${par} ${circ - par}`} strokeDashoffset={-(gab)} transform="rotate(-90 50 50)" />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={cor} strokeWidth={stroke}
            strokeDasharray={`${gab} ${circ - gab}`} strokeDashoffset="0" transform="rotate(-90 50 50)" />
          <text x="50" y="47" textAnchor="middle" fontSize="11" fontWeight="600" fill="#1a1a1a">{Math.round((gabarito/total)*100)}%</text>
          <text x="50" y="59" textAnchor="middle" fontSize="8" fill="#999">gabarito</text>
        </svg>
        <div style={{ fontSize: 10, fontWeight: 500, color: '#1a1a1a' }}>{materia}</div>
        <div style={{ fontSize: 9, color: '#999', marginTop: 2 }}>
          <span style={{ color: cor }}>■ {gabarito}g</span>{' '}
          <span style={{ color: '#EF9F27' }}>■ {parcial}p</span>{' '}
          <span style={{ color: '#ccc' }}>■ {zero}z</span>
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

                <div className="card" style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 14 }}>Assertividade 2ª fase</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    {[
                      { fase: '2fase_mat', mat: 'Matemática' },
                      { fase: '2fase_fis', mat: 'Física' },
                      { fase: '2fase_qui', mat: 'Química' },
                      { fase: '2fase_port', mat: 'Português/Redação' },
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
