'use client'
import { useEffect, useState } from 'react'
import { dbQuery, dbUpdate, dbInsert } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useParams, useRouter } from 'next/navigation'
import Nav from '@/components/Nav'

const STATUS_OPTS = [
  { value: 'nao_iniciada', label: 'Não iniciada', cor: '#ccc' },
  { value: 'em_andamento', label: 'Em andamento', cor: '#D97706' },
  { value: 'finalizada', label: 'Finalizada', cor: '#16A34A' },
]

export default function CronogramaAluno() {
  const { perfil, verticalAtiva } = useAuth()
  const params = useParams()
  const router = useRouter()
  const alunoId = params?.id as string

  const [topicos, setTopicos] = useState<any[]>([])
  const [progressos, setProgressos] = useState<Record<string, string>>({})
  const [materiaAtiva, setMateriaAtiva] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [nomeAluno, setNomeAluno] = useState('')
  const [concurso, setConcurso] = useState<any>(null)

  // Para aluno, usa o aluno_id do perfil; cai no param da URL se não estiver preenchido (Medicina sem aluno_id)
  const targetId = perfil?.papel === 'aluno' ? (perfil.aluno_id || alunoId) : alunoId

  useEffect(() => {
    load()
  }, [targetId, verticalAtiva])

  async function load() {
    const vertical = verticalAtiva || 'ITA'

    const [{ data: ts }, { data: ps }, { data: cs }] = await Promise.all([
      dbQuery('topicos', { vertical: `eq.${vertical}`, order: 'materia,incidencia.desc' }),
      dbQuery('progresso_topicos', { aluno_id: `eq.${targetId}` }),
      dbQuery('concursos', { vertical: `eq.${vertical}`, order: 'created_at.desc', limit: '1' }),
    ])

    setTopicos(ts || [])
    setConcurso(cs?.[0] ?? null)

    // Nome do aluno: tabela diferente por vertical
    if (vertical === 'Medicina') {
      const { data: aluno } = await dbQuery('alunos', { id: `eq.${targetId}` }, 'nome')
      setNomeAluno(aluno?.[0]?.nome || '')
    } else {
      const { data: aluno } = await dbQuery('alunos_dados', { id_aluno: `eq.${targetId}` }, 'nome')
      setNomeAluno(aluno?.[0]?.nome || '')
    }

    const pMap: Record<string, string> = {}
    ;(ps || []).forEach((p: any) => { pMap[p.topico_id] = p.status })
    setProgressos(pMap)

    const materias = [...new Set((ts || []).map((t: any) => t.materia))].sort() as string[]
    if (materias.length) setMateriaAtiva(materias[0])
    setLoading(false)
  }

  async function updateStatus(topicoId: string, status: string) {
    setSaving(topicoId)
    const existing = progressos[topicoId]

    if (existing) {
      await dbUpdate('progresso_topicos',
        { aluno_id: `eq.${targetId}`, topico_id: `eq.${topicoId}` },
        { status, updated_at: new Date().toISOString() }
      )
    } else {
      await dbInsert('progresso_topicos', [{ aluno_id: targetId, topico_id: topicoId, status }])
    }

    setProgressos(p => ({ ...p, [topicoId]: status }))
    setSaving(null)
  }

  const materias = [...new Set(topicos.map(t => t.materia))].sort()
  const topicosMat = topicos.filter(t => t.materia === materiaAtiva)

  function pctMat(mat: string) {
    const ts = topicos.filter(t => t.materia === mat)
    if (!ts.length) return 0
    const fin = ts.filter(t => progressos[t.id] === 'finalizada').length
    return Math.round((fin / ts.length) * 100)
  }

  const pctGeral = topicos.length
    ? Math.round((topicos.filter(t => progressos[t.id] === 'finalizada').length / topicos.length) * 100)
    : 0

  const isReadOnly = perfil?.papel !== 'aluno'

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        {perfil?.papel !== 'aluno' && (
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>←</button>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{perfil?.papel === 'aluno' ? 'Meu cronograma' : nomeAluno}</div>
          {concurso && <div style={{ fontSize: 11, color: '#999' }}>{concurso.nome}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: pctGeral >= 70 ? '#16A34A' : pctGeral >= 40 ? '#D97706' : '#DC2626' }}>{pctGeral}%</div>
          <div style={{ fontSize: 10, color: '#999' }}>do edital</div>
        </div>
      </div>

      {/* Barra geral */}
      <div style={{ height: 4, background: '#F1F5F9' }}>
        <div style={{ height: '100%', width: `${pctGeral}%`, background: pctGeral >= 70 ? '#16A34A' : pctGeral >= 40 ? '#D97706' : '#DC2626', transition: 'width 0.4s' }} />
      </div>

      {/* Seletor de matéria */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '10px 16px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
        {materias.map(m => {
          const pct = pctMat(m)
          const active = materiaAtiva === m
          return (
            <button key={m} onClick={() => setMateriaAtiva(m)} style={{
              padding: '5px 12px', borderRadius: 20, fontSize: 11, border: '0.5px solid rgba(0,0,0,0.12)',
              background: active ? '#f97316' : 'transparent', color: active ? 'white' : '#666',
              cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'DM Sans,sans-serif',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, minWidth: 70
            }}>
              <span>{m}</span>
              <span style={{ fontSize: 9, opacity: 0.8 }}>{pct}%</span>
            </button>
          )
        })}
      </div>

      <div style={{ padding: 16 }}>
        {loading ? <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>Carregando...</div>
        : topicos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 24px' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Cronograma ainda não disponível</div>
            <div style={{ fontSize: 13, color: '#aaa', lineHeight: 1.6 }}>
              O coordenador ainda não importou os tópicos do edital.<br />
              Assim que o cronograma for cadastrado, ele aparecerá aqui.
            </div>
          </div>
        ) : (
          <>
            {/* Stats da matéria */}
            {materiaAtiva && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                {STATUS_OPTS.map(s => {
                  const count = topicosMat.filter(t => (progressos[t.id] || 'nao_iniciada') === s.value).length
                  return (
                    <div key={s.value} className="card" style={{ textAlign: 'center', padding: '10px 8px' }}>
                      <div style={{ fontSize: 18, fontWeight: 600, color: s.cor }}>{count}</div>
                      <div style={{ fontSize: 9, color: '#999', lineHeight: 1.3 }}>{s.label}</div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Lista de tópicos */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {topicosMat.map((t, i) => {
                const status = progressos[t.id] || 'nao_iniciada'
                const statusInfo = STATUS_OPTS.find(s => s.value === status)!
                return (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                    borderBottom: i < topicosMat.length - 1 ? '0.5px solid rgba(0,0,0,0.06)' : 'none',
                    opacity: saving === t.id ? 0.6 : 1
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: '#1a1a1a', lineHeight: 1.4 }}>{t.topico}</div>
                      {t.incidencia > 0 && (
                        <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>
                          Incidência: <span style={{ color: t.incidencia >= 0.7 ? '#DC2626' : t.incidencia >= 0.4 ? '#D97706' : '#16A34A', fontWeight: 500 }}>{(t.incidencia * 100).toFixed(0)}%</span>
                        </div>
                      )}
                    </div>
                    {isReadOnly ? (
                      <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 10, background: statusInfo.cor + '22', color: statusInfo.cor, fontWeight: 500 }}>
                        {statusInfo.label}
                      </span>
                    ) : (
                      <select
                        value={status}
                        onChange={e => updateStatus(t.id, e.target.value)}
                        disabled={saving === t.id}
                        style={{
                          padding: '5px 8px', borderRadius: 8, border: `0.5px solid ${statusInfo.cor}`,
                          background: statusInfo.cor + '15', color: statusInfo.cor,
                          fontSize: 11, fontWeight: 500, cursor: 'pointer', minWidth: 110,
                          fontFamily: 'DM Sans,sans-serif'
                        }}
                      >
                        {STATUS_OPTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
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
