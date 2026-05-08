'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useParams, useRouter } from 'next/navigation'
import Nav from '@/components/Nav'

const STATUS_OPTS = [
  { value: 'nao_iniciada', label: 'Não iniciada', cor: '#ccc' },
  { value: 'em_andamento', label: 'Em andamento', cor: '#EF9F27' },
  { value: 'finalizada', label: 'Finalizada', cor: '#1D9E75' },
]

export default function CronogramaAluno() {
  const { perfil } = useAuth()
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

  // Para aluno, usa o próprio id
  const targetId = perfil?.papel === 'aluno' ? perfil.aluno_id! : alunoId

  useEffect(() => {
    load()
  }, [targetId])

  async function load() {
    const [{ data: ts }, { data: ps }, { data: cs }, { data: aluno }] = await Promise.all([
      supabase.from('topicos').select('*').order('materia').order('incidencia', { ascending: false }),
      supabase.from('progresso_topicos').select('*').eq('aluno_id', targetId),
      supabase.from('concursos').select('*').limit(1).single(),
      supabase.from('alunos_dados').select('nome').eq('id_aluno', targetId).single(),
    ])

    setTopicos(ts || [])
    setConcurso(cs)
    setNomeAluno(aluno?.nome || '')

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
      await supabase.from('progresso_topicos')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('aluno_id', targetId).eq('topico_id', topicoId)
    } else {
      await supabase.from('progresso_topicos')
        .insert([{ aluno_id: targetId, topico_id: topicoId, status }])
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
          <div style={{ fontSize: 20, fontWeight: 700, color: pctGeral >= 70 ? '#1D9E75' : pctGeral >= 40 ? '#EF9F27' : '#E24B4A' }}>{pctGeral}%</div>
          <div style={{ fontSize: 10, color: '#999' }}>do edital</div>
        </div>
      </div>

      {/* Barra geral */}
      <div style={{ height: 4, background: '#F0EEE8' }}>
        <div style={{ height: '100%', width: `${pctGeral}%`, background: pctGeral >= 70 ? '#1D9E75' : pctGeral >= 40 ? '#EF9F27' : '#E24B4A', transition: 'width 0.4s' }} />
      </div>

      {/* Seletor de matéria */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '10px 16px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
        {materias.map(m => {
          const pct = pctMat(m)
          const active = materiaAtiva === m
          return (
            <button key={m} onClick={() => setMateriaAtiva(m)} style={{
              padding: '5px 12px', borderRadius: 20, fontSize: 11, border: '0.5px solid rgba(0,0,0,0.12)',
              background: active ? '#534AB7' : 'transparent', color: active ? 'white' : '#666',
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
        {loading ? <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>Carregando...</div> : (
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
                          Incidência: <span style={{ color: t.incidencia >= 0.7 ? '#E24B4A' : t.incidencia >= 0.4 ? '#EF9F27' : '#1D9E75', fontWeight: 500 }}>{(t.incidencia * 100).toFixed(0)}%</span>
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
