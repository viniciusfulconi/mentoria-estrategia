'use client'
import { useEffect, useState, useMemo } from 'react'
import { dbQuery, dbUpsert } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Nav from '@/components/Nav'

type Questao = {
  id: string
  numero: number
  materia: string
  tipo: 'objetiva' | 'dissertativa'
  fase: number
  dia: number
  grupo: string | null
  gabarito: string | null
  topico: string | null
  subtopico: string | null
  subsubtopico: string | null
  pontuacao_max: number
  pct_acerto_turma?: number
}

type Resposta = {
  questao_id: string
  resposta: string
  pontuacao: number
}

type Tab = 'mapa' | 'materias' | 'autoavaliar'

const MOTIVOS_CERTO = [
  { key: 'sabia', label: 'Sabia' },
  { key: 'chute_certo', label: 'Chutei e acertei' },
]
const MOTIVOS_ERRADO = [
  { key: 'nao_sabia', label: 'Não sabia' },
  { key: 'descuido', label: 'Descuido' },
  { key: 'chute_errado', label: 'Chutei e errei' },
  { key: 'sem_tempo', label: 'Sem tempo' },
]

const MOTIVO_LABEL: Record<string, string> = {
  sabia: 'Sabia', chute_certo: 'Chutei e acertei',
  nao_sabia: 'Não sabia', descuido: 'Descuido',
  chute_errado: 'Chutei e errei', sem_tempo: 'Sem tempo',
}

export default function AlunoSimuladoDetalhe() {
  const { id: alunoId, sim_id } = useParams<{ id: string; sim_id: string }>()
  const router = useRouter()
  const { perfil } = useAuth()

  const [simulado, setSimulado] = useState<any>(null)
  const [aluno, setAluno] = useState<any>(null)
  const [questoes, setQuestoes] = useState<Questao[]>([])
  const [respostas, setRespostas] = useState<Resposta[]>([])
  const [autoavaliacao, setAutoavaliacao] = useState<Record<string, string>>({})
  const [carregando, setCarregando] = useState(true)
  const [tab, setTab] = useState<Tab>('mapa')
  const [questaoSelecionada, setQuestaoSelecionada] = useState<Questao | null>(null)

  useEffect(() => {
    if (!perfil) return
    const papelPermitido = ['coordenador', 'direcao', 'mentor', 'aluno'].includes(perfil.papel)
    if (!papelPermitido) {
      router.replace('/'); return
    }
    carregar()
  }, [perfil, alunoId, sim_id])

  async function carregar() {
    setCarregando(true)
    const [{ data: s }, { data: al }, { data: q }, { data: r }, { data: stats }, { data: av }] = await Promise.all([
      dbQuery('simulados_med', { id: `eq.${sim_id}` }, '*,simulado_templates(nome,tipo)'),
      dbQuery('alunos', { id: `eq.${alunoId}` }, 'id,nome'),
      dbQuery<Questao>('simulado_questoes', { simulado_id: `eq.${sim_id}`, order: 'fase.asc,dia.asc,numero.asc' }),
      dbQuery<Resposta>('simulado_respostas', { simulado_id: `eq.${sim_id}`, aluno_id: `eq.${alunoId}` }, 'questao_id,resposta,pontuacao'),
      dbQuery('simulado_questao_stats', { simulado_id: `eq.${sim_id}` }, 'questao_id,pct_acerto_turma'),
      dbQuery('simulado_autoavaliacao', { simulado_id: `eq.${sim_id}`, aluno_id: `eq.${alunoId}` }, 'questao_id,motivo'),
    ])
    setSimulado(s?.[0] || null)
    setAluno(al?.[0] || null)

    const statsMap: Record<string, number> = {}
    ;(stats || []).forEach((s: any) => { statsMap[s.questao_id] = s.pct_acerto_turma })
    setQuestoes((q || []).map(qst => ({ ...qst, pct_acerto_turma: statsMap[qst.id] })))

    setRespostas(r || [])

    const avMap: Record<string, string> = {}
    ;(av || []).forEach((a: any) => { avMap[a.questao_id] = a.motivo })
    setAutoavaliacao(avMap)
    setCarregando(false)
  }

  const respostaMap = useMemo(() => {
    const m: Record<string, Resposta> = {}
    respostas.forEach(r => { m[r.questao_id] = r })
    return m
  }, [respostas])

  const questoesObj = useMemo(() => questoes.filter(q => q.tipo === 'objetiva'), [questoes])

  const notasPorMateria = useMemo(() => {
    const map: Record<string, { acertos: number; total: number }> = {}
    questoesObj.forEach(q => {
      if (!map[q.materia]) map[q.materia] = { acertos: 0, total: 0 }
      map[q.materia].total++
      if (respostaMap[q.id]?.pontuacao > 0) map[q.materia].acertos++
    })
    return Object.entries(map).map(([materia, { acertos, total }]) => ({
      materia, acertos, total,
      pct: total > 0 ? Math.round((acertos / total) * 100) : 0,
    })).sort((a, b) => b.pct - a.pct)
  }, [questoesObj, respostaMap])

  const questoesPorDia = useMemo(() => {
    const map: Record<string, Questao[]> = {}
    questoesObj.forEach(q => {
      const k = `Dia ${q.dia}`
      if (!map[k]) map[k] = []
      map[k].push(q)
    })
    return map
  }, [questoesObj])

  // Diagnóstico de padrão de erro
  const diagnostico = useMemo(() => {
    const counts: Record<string, number> = {}
    Object.values(autoavaliacao).forEach(m => { counts[m] = (counts[m] || 0) + 1 })
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    return { counts, total }
  }, [autoavaliacao])

  async function salvarAutoavaliacao(questaoId: string, motivo: string) {
    setAutoavaliacao(m => ({ ...m, [questaoId]: motivo }))
    await dbUpsert('simulado_autoavaliacao', [{
      simulado_id: sim_id, aluno_id: alunoId, questao_id: questaoId, motivo,
    }], 'simulado_id,aluno_id,questao_id')
  }

  const totalObj = questoesObj.length
  const totalAcertos = respostas.filter(r => r.pontuacao > 0).length
  const pctGeral = totalObj > 0 ? Math.round((totalAcertos / totalObj) * 100) : 0

  function statusQuestao(q: Questao): 'acertou' | 'errou' | 'vazio' {
    const r = respostaMap[q.id]
    if (!r) return 'vazio'
    return r.pontuacao > 0 ? 'acertou' : 'errou'
  }

  const COR = {
    acertou: { bg: '#22c55e', text: 'white' },
    errou:   { bg: '#ef4444', text: 'white' },
    vazio:   { bg: '#e5e7eb', text: '#9ca3af' },
  }

  function scoreColor(pct: number) {
    if (pct >= 60) return '#166534'
    if (pct >= 40) return '#854d0e'
    return '#991b1b'
  }
  function scoreBg(pct: number) {
    if (pct >= 60) return '#DCFCE7'
    if (pct >= 40) return '#FEF9C3'
    return '#FEE2E2'
  }
  function barColor(pct: number) {
    if (pct >= 60) return '#22c55e'
    if (pct >= 40) return '#f59e0b'
    return '#ef4444'
  }

  if (carregando) return (
    <div style={{ paddingBottom: 80 }}>
      <Nav />
      <div style={{ textAlign: 'center', padding: 60, color: '#aaa', fontSize: 13 }}>Carregando...</div>
    </div>
  )
  if (!simulado || !aluno) return (
    <div style={{ paddingBottom: 80 }}>
      <Nav />
      <div style={{ textAlign: 'center', padding: 60, color: '#aaa', fontSize: 13 }}>Não encontrado.</div>
    </div>
  )

  const totalClassificadas = Object.keys(autoavaliacao).length
  const totalRespondidas = respostas.length

  return (
    <div style={{ paddingBottom: 80 }}>
      <Nav />

      {/* Header */}
      <div style={{
        background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)',
        padding: '14px 16px', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa', padding: 0, lineHeight: 1 }}>←</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {simulado.nome}
            </div>
            <div style={{ fontSize: 12, color: '#888' }}>{aluno.nome}</div>
          </div>
          <div style={{
            background: scoreBg(pctGeral), color: scoreColor(pctGeral),
            fontSize: 13, fontWeight: 700, padding: '5px 12px', borderRadius: 20, flexShrink: 0,
          }}>
            {totalAcertos}/{totalObj}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: 10, padding: 3, gap: 2 }}>
          {([['mapa', 'Mapa'], ['materias', 'Por matéria'], ['autoavaliar', 'Auto-avaliar']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setTab(v)} style={{
              flex: 1, padding: '7px 6px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: tab === v ? 600 : 400,
              background: tab === v ? 'white' : 'transparent',
              color: tab === v ? '#1a1a1a' : '#888',
              boxShadow: tab === v ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              fontFamily: 'DM Sans, sans-serif',
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* ── MAPA DE ACERTOS ── */}
      {tab === 'mapa' && (
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Legenda */}
          <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#666' }}>
            {([['acertou', 'Acertou'], ['errou', 'Errou'], ['vazio', 'Não respondeu']] as const).map(([tipo, label]) => (
              <div key={tipo} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: COR[tipo].bg, flexShrink: 0 }} />
                {label}
              </div>
            ))}
          </div>

          {Object.entries(questoesPorDia).map(([dia, qs]) => (
            <div key={dia}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                {dia}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {qs.map(q => {
                  const s = statusQuestao(q)
                  const av = autoavaliacao[q.id]
                  return (
                    <button
                      key={q.id}
                      onClick={() => setQuestaoSelecionada(q)}
                      title={av ? MOTIVO_LABEL[av] : undefined}
                      style={{
                        width: 36, height: 36, borderRadius: '50%',
                        background: COR[s].bg, color: COR[s].text,
                        border: av ? '2.5px solid rgba(0,0,0,0.25)' : '2px solid transparent',
                        cursor: 'pointer', fontSize: 11, fontWeight: 700,
                        fontFamily: 'DM Sans, sans-serif',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'transform 0.1s',
                        position: 'relative',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.18)')}
                      onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                    >
                      {q.numero}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Diagnóstico resumo (se já tem dados) */}
          {diagnostico.total > 0 && (
            <div style={{ background: 'white', borderRadius: 12, padding: '14px 16px', border: '0.5px solid rgba(0,0,0,0.08)', marginTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                Padrão de erro ({totalClassificadas}/{totalRespondidas} classificadas)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Object.entries(diagnostico.counts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([motivo, qtd]) => {
                    const pct = Math.round((qtd / diagnostico.total) * 100)
                    const isNegativo = ['nao_sabia', 'descuido', 'chute_errado', 'sem_tempo'].includes(motivo)
                    return (
                      <div key={motivo}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                          <span style={{ fontSize: 12, color: '#555' }}>{MOTIVO_LABEL[motivo]}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: isNegativo ? '#991b1b' : '#166534' }}>
                            {qtd}x ({pct}%)
                          </span>
                        </div>
                        <div style={{ height: 5, borderRadius: 3, background: '#F1F5F9', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: isNegativo ? '#ef4444' : '#22c55e' }} />
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── POR MATÉRIA ── */}
      {tab === 'materias' && (
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {notasPorMateria.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#aaa', fontSize: 13 }}>
              Nenhum resultado importado ainda.
            </div>
          ) : notasPorMateria.map(({ materia, acertos, total, pct }) => (
            <div key={materia} style={{ background: 'white', borderRadius: 12, padding: '14px 16px', border: '0.5px solid rgba(0,0,0,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a' }}>{materia}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#888' }}>{acertos}/{total}</span>
                  <span style={{
                    fontSize: 13, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                    background: scoreBg(pct), color: scoreColor(pct),
                  }}>
                    {pct}%
                  </span>
                </div>
              </div>
              <div style={{ height: 7, borderRadius: 4, background: '#F1F5F9', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, borderRadius: 4, background: barColor(pct), transition: 'width 0.6s ease' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── AUTO-AVALIAR ── */}
      {tab === 'autoavaliar' && (
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 4, lineHeight: 1.6 }}>
            Classifique cada questão para identificar seus padrões de erro ao longo dos simulados.
          </div>
          {questoesObj.map(q => {
            const r = respostaMap[q.id]
            if (!r) return null
            const acertou = r.pontuacao > 0
            const motivos = acertou ? MOTIVOS_CERTO : MOTIVOS_ERRADO
            const motivoAtual = autoavaliacao[q.id]
            return (
              <div
                key={q.id}
                style={{
                  background: 'white', borderRadius: 12, padding: '12px 14px',
                  border: `0.5px solid ${acertou ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#888' }}>Q{q.numero}</span>
                      <span style={{ fontSize: 11, color: '#bbb' }}>·</span>
                      <span style={{ fontSize: 12, color: '#555' }}>{q.materia}</span>
                    </div>
                    {q.topico && (
                      <div style={{ fontSize: 11, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {q.topico}{q.subtopico ? ` · ${q.subtopico}` : ''}
                      </div>
                    )}
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, flexShrink: 0, marginLeft: 8,
                    background: acertou ? '#DCFCE7' : '#FEE2E2',
                    color: acertou ? '#166534' : '#991b1b',
                  }}>
                    {acertou ? 'Certa' : 'Errada'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {motivos.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => salvarAutoavaliacao(q.id, key)}
                      style={{
                        padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
                        fontSize: 12, fontFamily: 'DM Sans, sans-serif', fontWeight: motivoAtual === key ? 600 : 400,
                        border: `1px solid ${motivoAtual === key ? 'var(--purple)' : 'rgba(0,0,0,0.12)'}`,
                        background: motivoAtual === key ? 'var(--purple)' : 'white',
                        color: motivoAtual === key ? 'white' : '#555',
                        transition: 'all 0.12s',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Bottom sheet: detalhe da questão ── */}
      {questaoSelecionada && (() => {
        const r = respostaMap[questaoSelecionada.id]
        const acertou = r && r.pontuacao > 0
        const s = statusQuestao(questaoSelecionada)
        const motivos = acertou ? MOTIVOS_CERTO : MOTIVOS_ERRADO
        const motivoAtual = autoavaliacao[questaoSelecionada.id]
        const pctTurma = questaoSelecionada.pct_acerto_turma

        return (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}
            onClick={e => { if (e.target === e.currentTarget) setQuestaoSelecionada(null) }}
          >
            <div style={{ background: 'white', borderRadius: '20px 20px 0 0', width: '100%', padding: '20px 20px 32px', maxHeight: '80vh', overflowY: 'auto' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: '#E0E0E0', margin: '0 auto 18px' }} />

              {/* Número + status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                  background: COR[s].bg, color: COR[s].text,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15, fontWeight: 700,
                }}>
                  {questaoSelecionada.numero}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>Questão {questaoSelecionada.numero}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>{questaoSelecionada.materia}</div>
                </div>
              </div>

              {/* Classificação */}
              {(questaoSelecionada.topico) && (
                <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7 }}>Classificação</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', marginBottom: questaoSelecionada.subtopico ? 3 : 0 }}>
                    {questaoSelecionada.topico}
                  </div>
                  {questaoSelecionada.subtopico && (
                    <div style={{ fontSize: 12, color: '#555', marginBottom: questaoSelecionada.subsubtopico ? 2 : 0, paddingLeft: 10, borderLeft: '2px solid #E5E7EB' }}>
                      {questaoSelecionada.subtopico}
                    </div>
                  )}
                  {questaoSelecionada.subsubtopico && (
                    <div style={{ fontSize: 11, color: '#888', paddingLeft: 20, borderLeft: '2px solid #E5E7EB', marginLeft: 10 }}>
                      {questaoSelecionada.subsubtopico}
                    </div>
                  )}
                </div>
              )}

              {/* Resposta + gabarito + turma */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
                <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#aaa', marginBottom: 4 }}>Sua resposta</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: s === 'acertou' ? '#22c55e' : s === 'errou' ? '#ef4444' : '#9ca3af' }}>
                    {r?.resposta || '—'}
                  </div>
                </div>
                <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#aaa', marginBottom: 4 }}>Gabarito</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1a1a' }}>
                    {questaoSelecionada.gabarito || '—'}
                  </div>
                </div>
                <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#aaa', marginBottom: 4 }}>Acerto turma</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: pctTurma != null ? scoreColor(pctTurma) : '#aaa' }}>
                    {pctTurma != null ? `${pctTurma}%` : '—'}
                  </div>
                </div>
              </div>

              {/* Barra de acerto da turma */}
              {pctTurma != null && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ height: 6, borderRadius: 3, background: '#F1F5F9', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pctTurma}%`, borderRadius: 3, background: '#6366f1' }} />
                  </div>
                  <div style={{ fontSize: 11, color: '#aaa', marginTop: 4, textAlign: 'right' }}>
                    {pctTurma >= 70 ? 'Questão fácil' : pctTurma >= 40 ? 'Questão média' : 'Questão difícil'}
                  </div>
                </div>
              )}

              {/* Auto-avaliação inline */}
              {r && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                    {acertou ? 'Você acertou porque...' : 'Você errou porque...'}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {motivos.map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => salvarAutoavaliacao(questaoSelecionada.id, key)}
                        style={{
                          padding: '8px 16px', borderRadius: 20, cursor: 'pointer',
                          fontSize: 13, fontFamily: 'DM Sans, sans-serif', fontWeight: motivoAtual === key ? 600 : 400,
                          border: `1.5px solid ${motivoAtual === key ? 'var(--purple)' : 'rgba(0,0,0,0.12)'}`,
                          background: motivoAtual === key ? 'var(--purple)' : 'white',
                          color: motivoAtual === key ? 'white' : '#555',
                          transition: 'all 0.12s',
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
