'use client'
import { useEffect, useState } from 'react'
import { dbQuery, dbUpdate, dbInsert } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useParams, useRouter } from 'next/navigation'
import Nav from '@/components/Nav'

const STATUS_OPTS = [
  { value: 'nao_iniciada', label: 'Não iniciada', cor: '#94a3b8' },
  { value: 'em_andamento', label: 'Em andamento', cor: '#D97706' },
  { value: 'finalizada',   label: 'Finalizada',   cor: '#16A34A' },
]

type SubtopicoFlat = {
  id: string
  nome: string
  topico_id: string
  topico_nome: string
  topico_ordem: number
  materia_id: string
  materia_nome: string
}

export default function CronogramaAluno() {
  const { perfil, verticalAtiva } = useAuth()
  const params  = useParams()
  const router  = useRouter()
  const alunoId = params?.id as string

  const [subtopicos, setSubtopicos] = useState<SubtopicoFlat[]>([])
  const [progressos, setProgressos] = useState<Record<string, string>>({})
  const [materiaAtiva, setMateriaAtiva] = useState('')
  const [topicoAberto, setTopicoAberto] = useState<string | null>(null)
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState<string | null>(null)
  const [nomeAluno, setNomeAluno]       = useState('')
  const [concurso, setConcurso]         = useState<any>(null)

  const targetId = perfil?.papel === 'aluno' ? (perfil.aluno_id || alunoId) : alunoId

  useEffect(() => { load() }, [targetId, verticalAtiva])

  async function load() {
    const vertical = verticalAtiva || 'ITA'

    const [
      { data: materias },
      { data: topicos },
      { data: subs },
      { data: ps },
      { data: cs },
    ] = await Promise.all([
      dbQuery('arvore_materias',   { vertical: `eq.${vertical}`, order: 'ordem.asc' }),
      dbQuery('arvore_topicos',    { order: 'ordem.asc' }, 'id,materia_id,nome,ordem'),
      dbQuery('arvore_subtopicos', { order: 'ordem.asc' }, 'id,topico_id,nome,ordem'),
      dbQuery('progresso_subtopicos', { aluno_id: `eq.${targetId}` }, 'subtopico_id,status'),
      dbQuery('concursos', { vertical: `eq.${vertical}`, order: 'created_at.desc', limit: '1' }),
    ])

    // Monta estrutura plana com hierarquia desnormalizada
    const topMap = new Map((topicos || []).map((t: any) => [t.id, t]))
    const matMap = new Map((materias || []).map((m: any) => [m.id, m]))

    const flat: SubtopicoFlat[] = []
    for (const s of (subs || []) as any[]) {
      const top = topMap.get(s.topico_id)
      if (!top) continue
      const mat = matMap.get(top.materia_id)
      if (!mat) continue
      flat.push({
        id:           s.id,
        nome:         s.nome,
        topico_id:    s.topico_id,
        topico_nome:  top.nome,
        topico_ordem: top.ordem,
        materia_id:   mat.id,
        materia_nome: mat.nome,
      })
    }

    setSubtopicos(flat)
    setConcurso(cs?.[0] ?? null)

    // Nome do aluno
    if (vertical === 'Medicina') {
      const { data: aluno } = await dbQuery('alunos', { id: `eq.${targetId}` }, 'nome')
      setNomeAluno(aluno?.[0]?.nome || '')
    } else {
      const { data: aluno } = await dbQuery('alunos_dados', { id_aluno: `eq.${targetId}` }, 'nome')
      setNomeAluno(aluno?.[0]?.nome || '')
    }

    const pMap: Record<string, string> = {}
    ;(ps || []).forEach((p: any) => { pMap[p.subtopico_id] = p.status })
    setProgressos(pMap)

    const primeiraMateria = (materias || [])[0]?.nome
    if (primeiraMateria) setMateriaAtiva(primeiraMateria)
    setLoading(false)
  }

  async function updateStatus(subtId: string, status: string) {
    setSaving(subtId)
    const existing = progressos[subtId]
    if (existing) {
      await dbUpdate('progresso_subtopicos',
        { aluno_id: `eq.${targetId}`, subtopico_id: `eq.${subtId}` },
        { status, updated_at: new Date().toISOString() }
      )
    } else {
      await dbInsert('progresso_subtopicos', [{ aluno_id: targetId, subtopico_id: subtId, status }])
    }
    setProgressos(p => ({ ...p, [subtId]: status }))
    setSaving(null)
  }

  // Derived
  const materias = [...new Map(subtopicos.map(s => [s.materia_nome, s.materia_id])).keys()].sort()
  const subsDaMateria = subtopicos.filter(s => s.materia_nome === materiaAtiva)

  // Agrupa por tópico mantendo a ordem
  const topicosOrdenados = [...new Map(
    subsDaMateria.map(s => [s.topico_id, { id: s.topico_id, nome: s.topico_nome, ordem: s.topico_ordem }])
  ).values()].sort((a, b) => a.ordem - b.ordem)

  function pctMat(mat: string) {
    const ts = subtopicos.filter(s => s.materia_nome === mat)
    if (!ts.length) return 0
    return Math.round(ts.filter(s => progressos[s.id] === 'finalizada').length / ts.length * 100)
  }

  function pctTop(topicoId: string) {
    const ts = subtopicos.filter(s => s.topico_id === topicoId)
    if (!ts.length) return 0
    return Math.round(ts.filter(s => progressos[s.id] === 'finalizada').length / ts.length * 100)
  }

  const pctGeral = subtopicos.length
    ? Math.round(subtopicos.filter(s => progressos[s.id] === 'finalizada').length / subtopicos.length * 100)
    : 0

  const isReadOnly = perfil?.papel !== 'aluno'

  const corPct = (p: number) => p >= 70 ? '#16A34A' : p >= 40 ? '#D97706' : '#DC2626'

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        {perfil?.papel !== 'aluno' && (
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>←</button>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{perfil?.papel === 'aluno' ? 'Meu cronograma' : nomeAluno}</div>
          {concurso && <div style={{ fontSize: 11, color: '#999' }}>{concurso.nome}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: corPct(pctGeral) }}>{pctGeral}%</div>
          <div style={{ fontSize: 10, color: '#999' }}>{subtopicos.filter(s => progressos[s.id] === 'finalizada').length}/{subtopicos.length} subtópicos</div>
        </div>
      </div>

      {/* Barra geral */}
      <div style={{ height: 4, background: '#F1F5F9' }}>
        <div style={{ height: '100%', width: `${pctGeral}%`, background: corPct(pctGeral), transition: 'width 0.4s' }} />
      </div>

      {/* Tabs de matéria */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '10px 16px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
        {materias.map(m => {
          const pct    = pctMat(m)
          const active = materiaAtiva === m
          return (
            <button key={m} onClick={() => { setMateriaAtiva(m); setTopicoAberto(null) }} style={{
              padding: '5px 12px', borderRadius: 20, fontSize: 11,
              border: '0.5px solid rgba(0,0,0,0.12)',
              background: active ? '#f97316' : 'transparent',
              color: active ? 'white' : '#666',
              cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, minWidth: 70,
            }}>
              <span>{m}</span>
              <span style={{ fontSize: 9, opacity: 0.8 }}>{pct}%</span>
            </button>
          )
        })}
      </div>

      <div style={{ padding: 16 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>Carregando...</div>
        ) : subtopicos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 24px' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Cronograma ainda não disponível</div>
          </div>
        ) : (
          <>
            {/* Stats da matéria */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
              {STATUS_OPTS.map(s => {
                const count = subsDaMateria.filter(t => (progressos[t.id] || 'nao_iniciada') === s.value).length
                return (
                  <div key={s.value} style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 600, color: s.cor }}>{count}</div>
                    <div style={{ fontSize: 9, color: '#999', lineHeight: 1.3 }}>{s.label}</div>
                  </div>
                )
              })}
            </div>

            {/* Tópicos agrupados */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topicosOrdenados.map(top => {
                const subs   = subsDaMateria.filter(s => s.topico_id === top.id)
                const pct    = pctTop(top.id)
                const aberto = topicoAberto === top.id
                const finalizados = subs.filter(s => progressos[s.id] === 'finalizada').length

                return (
                  <div key={top.id} style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 12, overflow: 'hidden' }}>
                    {/* Header do tópico */}
                    <button
                      onClick={() => setTopicoAberto(aberto ? null : top.id)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                        padding: '12px 16px', background: 'none', border: 'none',
                        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>{top.nome}</div>
                        <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>
                          {finalizados}/{subs.length} subtópicos
                        </div>
                      </div>
                      {/* Mini barra de progresso do tópico */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 60, height: 4, background: '#f1f5f9', borderRadius: 2 }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: corPct(pct), borderRadius: 2, transition: 'width 0.3s' }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: corPct(pct), minWidth: 28 }}>{pct}%</span>
                        <span style={{ fontSize: 14, color: '#94a3b8', transform: aberto ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>▼</span>
                      </div>
                    </button>

                    {/* Subtópicos */}
                    {aberto && (
                      <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.06)' }}>
                        {subs.map((s, i) => {
                          const status     = progressos[s.id] || 'nao_iniciada'
                          const statusInfo = STATUS_OPTS.find(o => o.value === status)!
                          return (
                            <div key={s.id} style={{
                              display: 'flex', alignItems: 'center', gap: 12,
                              padding: '10px 16px 10px 24px',
                              borderBottom: i < subs.length - 1 ? '0.5px solid rgba(0,0,0,0.04)' : 'none',
                              opacity: saving === s.id ? 0.6 : 1,
                              background: status === 'finalizada' ? '#f0fdf4' : 'white',
                            }}>
                              {/* Indicador de status */}
                              <div style={{
                                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                                background: statusInfo.cor,
                              }} />
                              <div style={{ flex: 1, fontSize: 13, color: '#1a1a1a', lineHeight: 1.4 }}>
                                {s.nome}
                              </div>
                              {isReadOnly ? (
                                <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 10, background: statusInfo.cor + '22', color: statusInfo.cor, fontWeight: 500 }}>
                                  {statusInfo.label}
                                </span>
                              ) : (
                                <select
                                  value={status}
                                  onChange={e => updateStatus(s.id, e.target.value)}
                                  disabled={saving === s.id}
                                  style={{
                                    padding: '5px 8px', borderRadius: 8,
                                    border: `0.5px solid ${statusInfo.cor}`,
                                    background: statusInfo.cor + '15', color: statusInfo.cor,
                                    fontSize: 11, fontWeight: 500, cursor: 'pointer',
                                    minWidth: 110, fontFamily: 'inherit',
                                  }}
                                >
                                  {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
      <Nav />
    </div>
  )
}
