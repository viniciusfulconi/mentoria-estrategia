'use client'
import { useEffect, useState } from 'react'
import { dbQuery, dbDelete } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import Nav from '@/components/Nav'
import Link from 'next/link'

import { CORES_MATERIA as CORES_MAT } from '@/lib/cores'

export default function ListasPage({ alunoId: propAlunoId }: { alunoId?: string }) {
  const { perfil } = useAuth()
  const [listas, setListas] = useState<any[]>([])
  const [materiaAtiva, setMateriaAtiva] = useState<string>('todas')
  const [loading, setLoading] = useState(true)

  const alunoId = propAlunoId || perfil?.aluno_id

  useEffect(() => {
    if (!alunoId) return
    dbQuery('listas', { aluno_id: `eq.${alunoId}`, order: 'data.desc' })
      .then(({ data }) => { setListas(data || []); setLoading(false) })
  }, [alunoId])

  const materias = [...new Set(listas.map(l => l.materia))].sort()

  const listasFiltradas = materiaAtiva === 'todas'
    ? listas : listas.filter(l => l.materia === materiaAtiva)

  // Estatísticas por matéria
  function statsMat(mat: string) {
    const ls = listas.filter(l => l.materia === mat)
    const totalAcertos = ls.reduce((a, l) => a + l.acertos, 0)
    const totalQuestoes = ls.reduce((a, l) => a + l.total, 0)
    const pct = totalQuestoes > 0 ? Math.round((totalAcertos / totalQuestoes) * 100) : 0
    return { pct, totalAcertos, totalQuestoes, count: ls.length }
  }

  // Estatísticas por tópico dentro da matéria
  function statsTopico(mat: string) {
    const ls = listas.filter(l => l.materia === mat)
    const topicoMap: Record<string, { acertos: number, total: number, count: number }> = {}
    ls.forEach(l => {
      const key = l.topico_nome || mat
      if (!topicoMap[key]) topicoMap[key] = { acertos: 0, total: 0, count: 0 }
      topicoMap[key].acertos += l.acertos
      topicoMap[key].total += l.total
      topicoMap[key].count += 1
    })
    return Object.entries(topicoMap).map(([nome, s]) => ({
      nome, ...s, pct: s.total > 0 ? Math.round((s.acertos / s.total) * 100) : 0
    })).sort((a, b) => b.pct - a.pct)
  }

  function corPct(n: number) { return n >= 70 ? '#16A34A' : n >= 50 ? '#D97706' : '#DC2626' }

  const isOwn = perfil?.papel === 'aluno'

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>Carregando...</div>

  return (
    <div>
      {/* Resumo por matéria */}
      {materias.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Desempenho por matéria</div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
            {materias.map(m => {
              const s = statsMat(m)
              const cor = CORES_MAT[m] || '#f97316'
              const active = materiaAtiva === m
              return (
                <button key={m} onClick={() => setMateriaAtiva(active ? 'todas' : m)} style={{
                  flexShrink: 0, padding: '10px 14px', borderRadius: 12,
                  border: `1.5px solid ${active ? cor : 'rgba(0,0,0,0.08)'}`,
                  background: active ? cor + '15' : 'white',
                  cursor: 'pointer', textAlign: 'center', minWidth: 90,
                  fontFamily: 'DM Sans,sans-serif'
                }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: cor }}>{s.pct}%</div>
                  <div style={{ fontSize: 10, fontWeight: 500, color: active ? cor : '#666', marginTop: 2 }}>{m}</div>
                  <div style={{ fontSize: 9, color: '#999', marginTop: 1 }}>{s.count} lista{s.count !== 1 ? 's' : ''}</div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Botão nova lista */}
      {isOwn && (
        <Link href="/listas/nova" style={{ textDecoration: 'none' }}>
          <div style={{ background: '#f97316', color: 'white', borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <span style={{ fontSize: 20 }}>+</span>
            <span style={{ fontSize: 14, fontWeight: 500 }}>Adicionar nova lista</span>
          </div>
        </Link>
      )}

      {listas.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: '#999' }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📝</div>
          <div style={{ marginBottom: 12 }}>Nenhuma lista cadastrada ainda.</div>
          {isOwn && (
            <Link href="/listas/nova" style={{ textDecoration: 'none', display: 'inline-block', background: '#f97316', color: 'white', borderRadius: 12, padding: '10px 20px', fontSize: 14 }}>
              Adicionar primeira lista
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* Desempenho por tópico (quando filtra por matéria) */}
          {materiaAtiva !== 'todas' && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12 }}>Desempenho por tópico — {materiaAtiva}</div>
              {statsTopico(materiaAtiva).map(t => (
                <div key={t.nome} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                    <span style={{ color: '#666', flex: 1 }}>{t.nome}</span>
                    <span style={{ fontSize: 10, color: '#999', marginRight: 8 }}>{t.acertos}/{t.total} · {t.count} lista{t.count !== 1 ? 's' : ''}</span>
                    <span style={{ fontWeight: 600, color: corPct(t.pct) }}>{t.pct}%</span>
                  </div>
                  <div style={{ height: 5, background: '#F1F5F9', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${t.pct}%`, background: corPct(t.pct), borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Lista de listas */}
          <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
            {materiaAtiva === 'todas' ? 'Todas as listas' : `Listas de ${materiaAtiva}`}
          </div>

          {/* Agrupa por matéria quando mostra todas */}
          {materiaAtiva === 'todas' ? (
            materias.map(mat => {
              const ls = listas.filter(l => l.materia === mat)
              const s = statsMat(mat)
              const cor = CORES_MAT[mat] || '#f97316'
              return (
                <div key={mat} style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: cor }}>{mat}</div>
                    <div style={{ fontSize: 11, color: '#999' }}>{s.totalAcertos}/{s.totalQuestoes} · <span style={{ color: corPct(s.pct), fontWeight: 600 }}>{s.pct}%</span></div>
                  </div>
                  {ls.map(l => {
                    const pct = Math.round((l.acertos / l.total) * 100)
                    return (
                      <ListaCard key={l.id} lista={l} pct={pct} cor={cor} corPct={corPct} isOwn={isOwn} onDelete={() => setListas(prev => prev.filter(x => x.id !== l.id))} />
                    )
                  })}
                </div>
              )
            })
          ) : (
            listasFiltradas.map(l => {
              const pct = Math.round((l.acertos / l.total) * 100)
              const cor = CORES_MAT[l.materia] || '#f97316'
              return (
                <ListaCard key={l.id} lista={l} pct={pct} cor={cor} corPct={corPct} isOwn={isOwn} onDelete={() => setListas(prev => prev.filter(x => x.id !== l.id))} />
              )
            })
          )}
        </>
      )}
    </div>
  )
}

function ListaCard({ lista, pct, cor, corPct, isOwn, onDelete }: any) {
  async function deletar() {
    if (!confirm(`Excluir "${lista.nome}"?`)) return
    await dbDelete('listas', { id: `eq.${lista.id}` })
    onDelete()
  }

  return (
    <div className="card" style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a', marginBottom: 2 }}>{lista.nome}</div>
          <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>
            {lista.topico_nome !== lista.materia && <span>{lista.topico_nome} · </span>}
            {new Date(lista.data).toLocaleDateString('pt-BR')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ height: 5, background: '#F1F5F9', borderRadius: 3, overflow: 'hidden', flex: 1 }}>
              <div style={{ height: '100%', width: `${pct}%`, background: corPct(pct), borderRadius: 3 }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: corPct(pct), minWidth: 36 }}>{pct}%</span>
          </div>
          <div style={{ fontSize: 10, color: '#999', marginTop: 3 }}>{lista.acertos} de {lista.total} acertos</div>
        </div>
        {isOwn && (
          <button onClick={deletar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 16, padding: 4 }}>✕</button>
        )}
      </div>
    </div>
  )
}
