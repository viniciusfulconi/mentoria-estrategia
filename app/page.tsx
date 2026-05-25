'use client'
import { useEffect, useState } from 'react'
import { dbQuery } from '@/lib/supabase'
import Nav from '@/components/Nav'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import {
  Users, Handshake, PlayCircle, CalendarCheck,
  TrendingUp, TrendingDown, BarChart2, Clock,
  DollarSign, BookOpen, Trophy, AlertTriangle,
  ArrowUp, ArrowDown,
} from 'lucide-react'

type CicloStats = { nome: string; aprovados: number; reprovados: number; total: number; media: number }
type AtendSemana = { sessoes: number; horas: number; sessoesAnterior: number }
type Financeiro = { gasto: number; orcamento: number }

export default function Home() {
  const { perfil, loading: authLoading } = useAuth()
  const router = useRouter()
  const [stats, setStats] = useState({ alunos: 0, mentores: 0, sessoesMes: 0, aulas: 0 })
  const [turmas, setTurmas] = useState<any[]>([])
  const [emRisco, setEmRisco] = useState<any[]>([])
  const [cicloStats, setCicloStats] = useState<CicloStats | null>(null)
  const [rankingTop, setRankingTop] = useState<any[]>([])
  const [rankingBottom, setRankingBottom] = useState<any[]>([])
  const [atendSemana, setAtendSemana] = useState<AtendSemana | null>(null)
  const [financeiro, setFinanceiro] = useState<Financeiro | null>(null)
  const [provasSemana, setProvasSemana] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (perfil?.papel === 'mentor') { router.replace('/mentor'); return }
    if (perfil?.papel === 'aluno') {
      router.replace(perfil.aluno_id ? `/aluno/${perfil.aluno_id}` : '/meu-perfil')
      return
    }
  }, [perfil, authLoading])

  useEffect(() => {
    if (authLoading) return
    if (perfil?.papel !== 'coordenador' && perfil?.papel !== 'direcao') return
    load()
  }, [authLoading, perfil])

  async function load() {
    const hoje = new Date()
    const hojeStr = hoje.toISOString().split('T')[0]
    const inicioMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`
    const seteDiasAtras = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const quatorzeAtras = new Date(hoje.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const [
      { data: alDados },
      { data: aulasD },
      { data: turmasD },
      { data: rankingsD },
      { data: atendRecentesD },
      { data: atendMesD },
      { data: provasD },
      { data: provasDefD },
    ] = await Promise.all([
      dbQuery('alunos_dados', {}, 'id_aluno,mentor'),
      dbQuery('aulas', {}, 'id'),
      dbQuery('turmas'),
      dbQuery('resultados',
        { fase: 'eq.ranking', order: 'ciclo_nome.desc' },
        'id_aluno,nome_aluno,mentor,ciclo_nome,resultado_ciclo,media_1fase,media_2fase,nota_matematica,nota_fisica,nota_quimica,media_linguagens'
      ),
      dbQuery('atendimentos_mentoria',
        { data_atendimento: `gte.${quatorzeAtras}` },
        'duracao_minutos,data_atendimento'
      ),
      dbQuery('atendimentos_mentoria',
        { data_atendimento: `gte.${inicioMes}` },
        'valor_pago'
      ),
      dbQuery('provas_aluno',
        { data: `gte.${hojeStr}`, order: 'data.asc' },
        'id,aluno_id,data,hora_inicio,prova_id'
      ),
      dbQuery('provas_antigas', {}, 'id,nome,tipo'),
    ])

    // Stats: derive mentor count from distinct mentors in alunos_dados
    const alList = alDados || []
    const mentoresSet = new Set(alList.map((a: any) => a.mentor).filter(Boolean))
    setStats({
      alunos: alList.length,
      mentores: mentoresSet.size,
      sessoesMes: atendMesD?.length || 0,
      aulas: aulasD?.length || 0,
    })

    const turmasList = turmasD || []
    setTurmas(turmasList)

    // Ciclo atual
    const rankings = rankingsD || []
    const latestCiclo = rankings[0]?.ciclo_nome || ''
    const cicloAtual = rankings.filter((r: any) => r.ciclo_nome === latestCiclo)

    if (cicloAtual.length) {
      const aprovados = cicloAtual.filter((r: any) => r.resultado_ciclo === 'Aprovado').length
      const reprovados = cicloAtual.filter((r: any) => r.resultado_ciclo === 'Reprovado').length
      const medias = cicloAtual.map((r: any) => {
        const m1 = Number(r.media_1fase || 0)
        const m2 = r.media_2fase != null ? Number(r.media_2fase) : null
        return m2 !== null ? (m1 + m2) / 2 : m1
      }).filter((v: number) => v > 0) as number[]
      const media = medias.length ? medias.reduce((a, b) => a + b, 0) / medias.length : 0
      setCicloStats({ nome: latestCiclo, aprovados, reprovados, total: cicloAtual.length, media })

      const sorted = [...cicloAtual].sort((a: any, b: any) => calcMedia(b) - calcMedia(a))
      const top = sorted.slice(0, 5)
      const topIds = new Set(top.map((r: any) => r.id_aluno))
      const bottom = sorted.filter((r: any) => !topIds.has(r.id_aluno)).slice(-3).reverse()
      setRankingTop(top)
      setRankingBottom(bottom)
    }

    // Alunos em risco (ciclo mais recente de cada aluno)
    const latestMap: Record<string, any> = {}
    rankings.forEach((r: any) => { if (!latestMap[r.id_aluno]) latestMap[r.id_aluno] = r })
    const risco = Object.values(latestMap).filter((r: any) => {
      if (r.resultado_ciclo === 'Reprovado') return true
      const notas = [r.nota_matematica, r.nota_fisica, r.nota_quimica, r.media_linguagens].map(Number).filter(v => v > 0)
      return notas.some(v => v < 4.5) || (r.media_2fase && Number(r.media_2fase) < 5.5 && Number(r.media_2fase) >= 5.0)
    }).sort((a: any, b: any) => {
      if (a.resultado_ciclo === 'Reprovado' && b.resultado_ciclo !== 'Reprovado') return -1
      if (b.resultado_ciclo === 'Reprovado' && a.resultado_ciclo !== 'Reprovado') return 1
      return (a.nome_aluno || '').localeCompare(b.nome_aluno || '')
    })
    setEmRisco(risco)

    // Atendimentos da semana vs semana anterior
    const atendRecentes = atendRecentesD || []
    const semana = atendRecentes.filter((a: any) => a.data_atendimento >= seteDiasAtras)
    const semanaAnt = atendRecentes.filter((a: any) => a.data_atendimento < seteDiasAtras)
    setAtendSemana({
      sessoes: semana.length,
      horas: Math.round(semana.reduce((a: number, d: any) => a + (d.duracao_minutos || 0), 0) / 60 * 10) / 10,
      sessoesAnterior: semanaAnt.length,
    })

    // Financeiro do mês
    const gastoMes = (atendMesD || []).reduce((a: number, d: any) => a + Number(d.valor_pago || 0), 0)
    const orcTotal = turmasList.reduce((a: number, t: any) => a + Number(t.orcamento_total || 0), 0)
    setFinanceiro({ gasto: gastoMes, orcamento: orcTotal })

    // Provas dos próximos 7 dias
    const provaDefMap = Object.fromEntries((provasDefD || []).map((p: any) => [p.id, p]))
    setProvasSemana((provasD || []).slice(0, 6).map((p: any) => ({ ...p, prova: provaDefMap[p.prova_id] || null })))

    setLoading(false)
  }

  function calcMedia(r: any) {
    return r.media_2fase != null
      ? (Number(r.media_1fase || 0) + Number(r.media_2fase)) / 2
      : Number(r.media_1fase || 0)
  }

  function corMedia(m: number) {
    return m >= 7 ? '#16A34A' : m >= 5.5 ? '#2563EB' : m >= 4.5 ? '#D97706' : '#DC2626'
  }

  function formatMoeda(v: number) {
    return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  }

  const isDirecao = perfil?.papel === 'direcao'
  if (authLoading || (perfil?.papel !== 'coordenador' && perfil?.papel !== 'direcao')) return null

  const statCards = [
    { label: 'Alunos ativos', value: stats.alunos, sub: 'ITA + Medicina', icon: Users, color: '#2563EB', bg: '#EFF6FF' },
    { label: 'Mentores', value: stats.mentores, sub: 'no programa', icon: Handshake, color: '#7C3AED', bg: '#F3F0FF' },
    { label: 'Sessões este mês', value: stats.sessoesMes, sub: 'atendimentos', icon: CalendarCheck, color: '#16A34A', bg: '#F0FDF4' },
    { label: 'Videoaulas', value: stats.aulas, sub: 'cadastradas', icon: PlayCircle, color: '#EA580C', bg: '#FFF7ED' },
  ]

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>Estratégia Concursos</div>
          <div style={{ fontSize: 17, fontWeight: 600, color: '#2563EB' }}>Mentoria</div>
        </div>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: '#1E40AF' }}>CO</div>
      </div>

      <div style={{ padding: 16 }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          {statCards.map(s => {
            const Icon = s.icon
            return (
              <div key={s.label} style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: '#999' }}>{s.label}</div>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={14} color={s.color} strokeWidth={2} />
                  </div>
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, color: '#1a1a1a', lineHeight: 1 }}>{loading ? '—' : s.value}</div>
                <div style={{ fontSize: 11, color: '#bbb', marginTop: 3 }}>{s.sub}</div>
              </div>
            )
          })}
        </div>

        {/* Ciclo atual */}
        {!loading && cicloStats && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
              {cicloStats.nome.replace(' - ITA', '').replace(' - IME', '')} · {cicloStats.total} alunos
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div style={{ background: '#F0FDF4', borderRadius: 14, padding: '12px 10px', textAlign: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
                  <TrendingUp size={16} color="#16A34A" strokeWidth={2} />
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#16A34A' }}>{cicloStats.aprovados}</div>
                <div style={{ fontSize: 10, color: '#64748B' }}>aprovados</div>
              </div>
              <div style={{ background: cicloStats.reprovados > 0 ? '#FEF2F2' : '#F8FAFC', borderRadius: 14, padding: '12px 10px', textAlign: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
                  <TrendingDown size={16} color={cicloStats.reprovados > 0 ? '#DC2626' : '#94A3B8'} strokeWidth={2} />
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: cicloStats.reprovados > 0 ? '#DC2626' : '#94A3B8' }}>{cicloStats.reprovados}</div>
                <div style={{ fontSize: 10, color: '#64748B' }}>reprovados</div>
              </div>
              <div style={{ background: '#F8FAFC', borderRadius: 14, padding: '12px 10px', textAlign: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
                  <BarChart2 size={16} color={corMedia(cicloStats.media)} strokeWidth={2} />
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: corMedia(cicloStats.media) }}>{cicloStats.media.toFixed(1)}</div>
                <div style={{ fontSize: 10, color: '#64748B' }}>média geral</div>
              </div>
            </div>
          </div>
        )}

        {/* Atendimentos da semana + Financeiro */}
        {!loading && (atendSemana || financeiro) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
            {atendSemana && (
              <div style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Clock size={13} color="#2563EB" strokeWidth={2} />
                  <div style={{ fontSize: 11, color: '#999' }}>Esta semana</div>
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#1a1a1a', lineHeight: 1 }}>{atendSemana.sessoes}</div>
                <div style={{ fontSize: 11, color: '#bbb', marginTop: 2 }}>{atendSemana.horas}h de mentoria</div>
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
                  {atendSemana.sessoes >= atendSemana.sessoesAnterior
                    ? <ArrowUp size={10} color="#16A34A" strokeWidth={2} />
                    : <ArrowDown size={10} color="#DC2626" strokeWidth={2} />}
                  <span style={{ color: atendSemana.sessoes >= atendSemana.sessoesAnterior ? '#16A34A' : '#DC2626' }}>
                    {atendSemana.sessoesAnterior} na sem. ant.
                  </span>
                </div>
              </div>
            )}
            {financeiro && (
              <div style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <DollarSign size={13} color="#7C3AED" strokeWidth={2} />
                  <div style={{ fontSize: 11, color: '#999' }}>Gasto do mês</div>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a1a', lineHeight: 1 }}>{formatMoeda(financeiro.gasto)}</div>
                {financeiro.orcamento > 0 ? (
                  <>
                    <div style={{ fontSize: 10, color: '#bbb', marginTop: 2 }}>de {formatMoeda(financeiro.orcamento)}</div>
                    <div style={{ marginTop: 8, background: '#F1F5F9', borderRadius: 4, height: 4, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 4,
                        background: financeiro.gasto / financeiro.orcamento > 0.9 ? '#DC2626' : '#7C3AED',
                        width: `${Math.min(100, financeiro.gasto / financeiro.orcamento * 100)}%`,
                        transition: 'width 0.6s ease',
                      }} />
                    </div>
                    <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 3 }}>
                      {(financeiro.gasto / financeiro.orcamento * 100).toFixed(0)}% do orçamento
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 10, color: '#bbb', marginTop: 2 }}>sem orçamento definido</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Provas agendadas próximos 7 dias */}
        {!loading && provasSemana.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
              Provas · próximos 7 dias
            </div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {provasSemana.map((p, i) => {
                const dt = new Date(p.data + 'T12:00')
                const diaLabel = dt.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
                return (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                    borderBottom: i < provasSemana.length - 1 ? '0.5px solid rgba(0,0,0,0.06)' : 'none',
                  }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: '#F3F0FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <BookOpen size={15} color="#7C3AED" strokeWidth={2} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.prova?.nome || 'Prova'}
                      </div>
                      <div style={{ fontSize: 10, color: '#999', marginTop: 1 }}>{diaLabel} · {p.hora_inicio}</div>
                    </div>
                    {p.prova?.tipo && (
                      <span className={p.prova.tipo === 'ita' ? 'badge-ita' : 'badge-med'} style={{ flexShrink: 0 }}>
                        {p.prova.tipo.toUpperCase()}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Ranking: top 5 + piores */}
        {!loading && rankingTop.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
              Ranking · {cicloStats?.nome?.replace(' - ITA', '').replace(' - IME', '')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                  <Trophy size={12} color="#D97706" strokeWidth={2} />
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#D97706' }}>Melhores</span>
                </div>
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  {rankingTop.map((r, i) => {
                    const media = calcMedia(r)
                    return (
                      <Link key={r.id_aluno} href={`/aluno/${r.id_aluno}`} style={{ textDecoration: 'none' }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                          borderBottom: i < rankingTop.length - 1 ? '0.5px solid rgba(0,0,0,0.06)' : 'none',
                        }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#D97706', width: 16, flexShrink: 0 }}>{i + 1}°</span>
                          <div style={{ flex: 1, minWidth: 0, fontSize: 11, fontWeight: 500, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.nome_aluno?.split(' ')[0]}
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: corMedia(media), flexShrink: 0 }}>{media.toFixed(1)}</span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>

              {rankingBottom.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                    <AlertTriangle size={12} color="#DC2626" strokeWidth={2} />
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#DC2626' }}>Precisam de atenção</span>
                  </div>
                  <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    {rankingBottom.map((r, i) => {
                      const media = calcMedia(r)
                      return (
                        <Link key={r.id_aluno} href={`/aluno/${r.id_aluno}`} style={{ textDecoration: 'none' }}>
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                            borderBottom: i < rankingBottom.length - 1 ? '0.5px solid rgba(0,0,0,0.06)' : 'none',
                            background: r.resultado_ciclo === 'Reprovado' ? '#FFF8F8' : 'transparent',
                          }}>
                            <div style={{ flex: 1, minWidth: 0, fontSize: 11, fontWeight: 500, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {r.nome_aluno?.split(' ')[0]}
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700, color: corMedia(media), flexShrink: 0 }}>{media.toFixed(1)}</span>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Alunos em risco */}
        {!loading && emRisco.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ marginBottom: 8, fontSize: 11, fontWeight: 600, color: '#999', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Atenção — {emRisco.length} aluno{emRisco.length > 1 ? 's' : ''} em risco
            </div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {emRisco.map((r, i) => {
                const isCortado = r.resultado_ciclo === 'Reprovado'
                const notas = [
                  { label: 'Mat', val: r.nota_matematica },
                  { label: 'Fís', val: r.nota_fisica },
                  { label: 'Quí', val: r.nota_quimica },
                  { label: 'Port', val: r.media_linguagens },
                ].filter(n => n.val != null && Number(n.val) > 0)
                const criticas = notas.filter(n => Number(n.val) < 4.5)
                return (
                  <Link key={r.id_aluno} href={`/aluno/${r.id_aluno}`} style={{ textDecoration: 'none' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px',
                      borderBottom: i < emRisco.length - 1 ? '1px solid var(--border)' : 'none',
                      background: isCortado ? '#FFF8F8' : '#FFFCF3',
                    }}>
                      <div style={{ flexShrink: 0 }}>
                        <AlertTriangle size={14} color={isCortado ? '#DC2626' : '#D97706'} strokeWidth={2} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.nome_aluno}
                        </div>
                        <div style={{ fontSize: 10, color: '#999', marginTop: 1 }}>
                          {r.mentor} · {String(r.ciclo_nome).replace('Ciclo ', 'C')}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        {criticas.length > 0 ? (
                          <div style={{ fontSize: 11, color: isCortado ? '#DC2626' : '#D97706', fontWeight: 600 }}>
                            {criticas.map(n => `${n.label} ${Number(n.val).toFixed(1)}`).join(' · ')}
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, color: '#D97706', fontWeight: 600 }}>
                            Média {Number(r.media_2fase).toFixed(1)}
                          </div>
                        )}
                        <div style={{ fontSize: 10, color: '#bbb', marginTop: 1 }}>
                          {isCortado ? 'Reprovado' : 'Próximo do limite'}
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* Turmas ativas */}
        {!loading && turmas.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ marginBottom: 8, fontSize: 11, fontWeight: 600, color: '#999', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Turmas ativas</div>
            {turmas.map((t: any) => (
              <div key={t.id} className="card" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{t.nome}</div>
                  <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{t.ano}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className={t.tipo === 'ITA' ? 'badge-ita' : 'badge-med'}>{t.tipo}</span>
                  <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>R$ {Number(t.orcamento_total || 0).toLocaleString('pt-BR')}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Acesso rápido */}
        <div style={{ marginBottom: 8, fontSize: 11, fontWeight: 600, color: '#999', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Acesso rápido</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {([
            ...(!isDirecao ? [
              { href: '/simulados/upload', label: 'Importar resultados', icon: BarChart2 },
              { href: '/aulas/nova', label: 'Nova aula', icon: PlayCircle },
            ] : []),
            { href: '/atendimentos', label: 'Atendimentos', icon: Handshake },
            { href: '/provas-antigas', label: 'Provas antigas', icon: BookOpen },
          ] as { href: string; label: string; icon: React.ComponentType<any> }[]).map(l => {
            const Icon = l.icon
            return (
              <Link key={l.href} href={l.href} style={{ textDecoration: 'none' }}>
                <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <Icon size={16} color="#2563EB" strokeWidth={2} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{l.label}</span>
                </div>
              </Link>
            )
          })}
        </div>

      </div>
      <Nav />
    </div>
  )
}
