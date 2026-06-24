'use client'
import { useEffect, useState } from 'react'
import { dbQuery, dbQueryAll, dbUpdate, dbInsert } from '@/lib/supabase'
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
  materia_ordem: number
  area_id: string
  area_nome: string
  area_ordem: number
}

export default function CronogramaAluno() {
  const { perfil, verticalAtiva } = useAuth()
  const params  = useParams()
  const router  = useRouter()
  const alunoId = params?.id as string

  const [subtopicos, setSubtopicos] = useState<SubtopicoFlat[]>([])
  const [progressos, setProgressos] = useState<Record<string, string>>({})
  const [areaAtiva, setAreaAtiva] = useState('')
  const [materiaAberta, setMateriaAberta] = useState<string | null>(null)
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
      { data: areas },
      { data: materias },
      { data: topicos },
      { data: subs },
      { data: ps },
      { data: cs },
    ] = await Promise.all([
      dbQuery('arvore_areas',      { vertical: `eq.${vertical}`, order: 'ordem.asc' }),
      dbQuery('arvore_materias',   { vertical: `eq.${vertical}`, order: 'ordem.asc' }),
      dbQuery('arvore_topicos',    { vertical: `eq.${vertical}`, order: 'ordem.asc' }, 'id,materia_id,nome,ordem'),
      dbQueryAll('arvore_subtopicos', { vertical: `eq.${vertical}`, order: 'ordem.asc' }, 'id,topico_id,nome,ordem'),
      dbQuery('progresso_subtopicos', { aluno_id: `eq.${targetId}` }, 'subtopico_id,status'),
      dbQuery('concursos', { vertical: `eq.${vertical}`, order: 'created_at.desc', limit: '1' }),
    ])

    // Monta estrutura plana com hierarquia desnormalizada
    const topMap = new Map((topicos || []).map((t: any) => [t.id, t]))
    const matMap = new Map((materias || []).map((m: any) => [m.id, m]))
    const areaMap = new Map((areas || []).map((a: any) => [a.id, a]))

    const flat: SubtopicoFlat[] = []
    for (const s of (subs || []) as any[]) {
      const top = topMap.get(s.topico_id)
      if (!top) continue
      const mat = matMap.get(top.materia_id)
      if (!mat) continue
      const area = areaMap.get(mat.area_id)
      if (!area) continue
      flat.push({
        id:            s.id,
        nome:          s.nome,
        topico_id:     s.topico_id,
        topico_nome:   top.nome,
        topico_ordem:  top.ordem,
        materia_id:    mat.id,
        materia_nome:  mat.nome,
        materia_ordem: mat.ordem,
        area_id:       area.id,
        area_nome:     area.nome,
        area_ordem:    area.ordem,
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

    const primeiraArea = (areas || [])[0]?.nome
    if (primeiraArea) setAreaAtiva(primeiraArea)
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
  const areas = [...new Map(
    subtopicos.map(s => [s.area_id, { id: s.area_id, nome: s.area_nome, ordem: s.area_ordem }])
  ).values()].sort((a, b) => a.ordem - b.ordem)

  const subsDaArea = subtopicos.filter(s => s.area_nome === areaAtiva)

  const materiasDaArea = [...new Map(
    subsDaArea.map(s => [s.materia_id, { id: s.materia_id, nome: s.materia_nome, ordem: s.materia_ordem }])
  ).values()].sort((a, b) => a.ordem - b.ordem)

  function pctArea(areaNome: string) {
    const ts = subtopicos.filter(s => s.area_nome === areaNome)
    if (!ts.length) return 0
    return Math.round(ts.filter(s => progressos[s.id] === 'finalizada').length / ts.length * 100)
  }

  function pctMat(matId: string) {
    const ts = subtopicos.filter(s => s.materia_id === matId)
    if (!ts.length) return 0
    return Math.round(ts.filter(s => progressos[s.id] === 'finalizada').length / ts.length * 100)
  }

  function pctTop(topicoId: string) {
    const ts = subtopicos.filter(s => s.topico_id === topicoId)
    if (!ts.length) return 0
    return Math.round(ts.filter(s => progressos[s.id] === 'finalizada').length / ts.length * 100)
  }

  function topicosDaMateria(matId: string) {
    return [...new Map(
      subsDaArea.filter(s => s.materia_id === matId)
        .map(s => [s.topico_id, { id: s.topico_id, nome: s.topico_nome, ordem: s.topico_ordem }])
    ).values()].sort((a, b) => a.ordem - b.ordem)
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

      {/* Tabs de área */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '12px 16px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
        {areas.map(a => {
          const pct    = pctArea(a.nome)
          const active = areaAtiva === a.nome
          return (
            <button key={a.id} onClick={() => { setAreaAtiva(a.nome); setMateriaAberta(null); setTopicoAberto(null) }} style={{
              padding: '8px 16px', borderRadius: 24, fontSize: 13,
              border: '0.5px solid rgba(0,0,0,0.12)',
              background: active ? '#f97316' : 'transparent',
              color: active ? 'white' : '#475569',
              cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 8, fontWeight: active ? 600 : 500,
            }}>
              <span>{a.nome}</span>
              <span style={{ fontSize: 11, opacity: 0.85, fontWeight: 600 }}>{pct}%</span>
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
            {/* Stats da área */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
              {STATUS_OPTS.map(s => {
                const count = subsDaArea.filter(t => (progressos[t.id] || 'nao_iniciada') === s.value).length
                return (
                  <div key={s.value} style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 600, color: s.cor }}>{count}</div>
                    <div style={{ fontSize: 9, color: '#999', lineHeight: 1.3 }}>{s.label}</div>
                  </div>
                )
              })}
            </div>

            {/* Matérias agrupadas (Nível 1) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {materiasDaArea.map(mat => {
                const tops      = topicosDaMateria(mat.id)
                const pctM      = pctMat(mat.id)
                const subsMat   = subsDaArea.filter(s => s.materia_id === mat.id)
                const totalSub  = subsMat.length
                const finalSub  = subsMat.filter(s => progressos[s.id] === 'finalizada').length
                const matAberta = materiaAberta === mat.id

                return (
                  <div key={mat.id} style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 14, overflow: 'hidden' }}>
                    {/* Header da matéria */}
                    <button
                      onClick={() => { setMateriaAberta(matAberta ? null : mat.id); setTopicoAberto(null) }}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                        padding: '14px 16px', background: matAberta ? '#fff7ed' : 'none', border: 'none',
                        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f2554' }}>{mat.nome}</div>
                        <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>
                          {finalSub}/{totalSub} subtópicos · {tops.length} tópico{tops.length !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 70, height: 5, background: '#f1f5f9', borderRadius: 3 }}>
                          <div style={{ height: '100%', width: `${pctM}%`, background: corPct(pctM), borderRadius: 3, transition: 'width 0.3s' }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: corPct(pctM), minWidth: 32 }}>{pctM}%</span>
                        <span style={{ fontSize: 14, color: '#94a3b8', transform: matAberta ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>▼</span>
                      </div>
                    </button>

                    {/* Tópicos da matéria (Nível 2) */}
                    {matAberta && (
                      <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.06)', padding: 10, display: 'flex', flexDirection: 'column', gap: 6, background: '#fafafa' }}>
                        {tops.map(top => {
                          const subs   = subsMat.filter(s => s.topico_id === top.id)
                          const pct    = pctTop(top.id)
                          const aberto = topicoAberto === top.id
                          const finalizados = subs.filter(s => progressos[s.id] === 'finalizada').length

                          return (
                            <div key={top.id} style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 10, overflow: 'hidden' }}>
                              {/* Header do tópico */}
                              <button
                                onClick={() => setTopicoAberto(aberto ? null : top.id)}
                                style={{
                                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                                  padding: '10px 14px', background: 'none', border: 'none',
                                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                                }}
                              >
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: '#1a1a1a' }}>{top.nome}</div>
                                  <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>
                                    {finalizados}/{subs.length} subtópicos
                                  </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ width: 50, height: 3, background: '#f1f5f9', borderRadius: 2 }}>
                                    <div style={{ height: '100%', width: `${pct}%`, background: corPct(pct), borderRadius: 2, transition: 'width 0.3s' }} />
                                  </div>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: corPct(pct), minWidth: 28 }}>{pct}%</span>
                                  <span style={{ fontSize: 12, color: '#94a3b8', transform: aberto ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>▼</span>
                                </div>
                              </button>

                              {/* Subtópicos (Nível 3) */}
                              {aberto && (
                                <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.06)' }}>
                                  {subs.map((s, i) => {
                                    const status     = progressos[s.id] || 'nao_iniciada'
                                    const statusInfo = STATUS_OPTS.find(o => o.value === status)!
                                    return (
                                      <div key={s.id} style={{
                                        display: 'flex', alignItems: 'center', gap: 12,
                                        padding: '9px 14px 9px 22px',
                                        borderBottom: i < subs.length - 1 ? '0.5px solid rgba(0,0,0,0.04)' : 'none',
                                        opacity: saving === s.id ? 0.6 : 1,
                                        background: status === 'finalizada' ? '#f0fdf4' : 'white',
                                      }}>
                                        <div style={{
                                          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                                          background: statusInfo.cor,
                                        }} />
                                        <div style={{ flex: 1, fontSize: 12, color: '#1a1a1a', lineHeight: 1.4 }}>
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
