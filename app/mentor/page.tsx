'use client'
import { useEffect, useState } from 'react'
import { supabase, dbQuery } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import Nav from '@/components/Nav'
import Link from 'next/link'
import { Clock, Brain, CalendarCheck } from 'lucide-react'

export default function MentorDashboard() {
  const { perfil, signOut } = useAuth()
  const [alunos, setAlunos] = useState<any[]>([])
  const [ciclos, setCiclos] = useState<string[]>([])
  const [cicloAtivo, setCicloAtivo] = useState('')
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [metricas, setMetricas] = useState<{ sessoes: number; horas: number; psico: number } | null>(null)

  useEffect(() => {
    if (!perfil?.mentor_nome) return
    carregar()
    carregarMetricas()
  }, [perfil])

  async function carregarMetricas() {
    const hoje = new Date()
    const inicioMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`
    const { data } = await dbQuery(
      'atendimentos_mentoria',
      { mentor: `eq.${perfil!.mentor_nome!}`, data_atendimento: `gte.${inicioMes}` },
      'duracao_minutos,encaminhamento_psico'
    )
    if (!data) return
    const sessoes = data.length
    const horas = Math.round(data.reduce((a: number, d: any) => a + (d.duracao_minutos || 0), 0) / 60 * 10) / 10
    const psico = data.filter((d: any) => d.encaminhamento_psico).length
    setMetricas({ sessoes, horas, psico })
  }

  async function carregar() {
    setErro(null)
    const { data, error } = await dbQuery(
      'resultados',
      { fase: 'eq.ranking', mentor: `eq.${perfil!.mentor_nome!}`, order: 'ciclo_nome' }
    )

    if (error) { setErro('Falha ao carregar dados.'); setLoading(false); return }
    const d = data || []
    const cs = [...new Set(d.map(r => r.ciclo_nome))].sort() as string[]
    setCiclos(cs)
    if (cs.length) setCicloAtivo(cs[cs.length - 1])

    const map: Record<string, any> = {}
    d.forEach(r => {
      if (!map[r.id_aluno]) map[r.id_aluno] = { id: r.id_aluno, nome: r.nome_aluno, ciclos: {} }
      map[r.id_aluno].ciclos[r.ciclo_nome] = r
    })
    setAlunos(Object.values(map))
    setLoading(false)
  }

  function corNota(n: number) { return n >= 7 ? '#16A34A' : n >= 4 ? '#D97706' : '#DC2626' }

  const cicloData = alunos
    .filter(a => a.ciclos[cicloAtivo])
    .map(a => a.ciclos[cicloAtivo])
    .sort((a, b) => (a.classificacao || 99) - (b.classificacao || 99))

  const reprovados = cicloData.filter(r => r.resultado_ciclo === 'Reprovado')
  const mediaGrupo = cicloData.length
    ? cicloData.reduce((acc, r) => {
        const m = r.media_2fase !== null ? Number(r.media_2fase) : Number(r.media_1fase || 0)
        return acc + m
      }, 0) / cicloData.length
    : 0

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: '#999' }}>Mentor</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{perfil?.mentor_nome || perfil?.nome}</div>
          </div>
          <button onClick={signOut} style={{ background: 'none', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer', color: '#999' }}>Sair</button>
        </div>
      </div>

      {/* Métricas do mês */}
      {metricas !== null && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '12px 16px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
          <div style={{ textAlign: 'center', padding: '10px 8px', borderRadius: 12, background: '#fff7ed' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}><CalendarCheck size={16} color="#f97316" strokeWidth={2} /></div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#f97316' }}>{metricas.sessoes}</div>
            <div style={{ fontSize: 10, color: '#64748B' }}>sessões/mês</div>
          </div>
          <div style={{ textAlign: 'center', padding: '10px 8px', borderRadius: 12, background: '#F0FDF4' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}><Clock size={16} color="#16A34A" strokeWidth={2} /></div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#16A34A' }}>{metricas.horas}h</div>
            <div style={{ fontSize: 10, color: '#64748B' }}>horas/mês</div>
          </div>
          <div style={{ textAlign: 'center', padding: '10px 8px', borderRadius: 12, background: metricas.psico > 0 ? '#FFF7ED' : '#F8FAFC' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}><Brain size={16} color={metricas.psico > 0 ? '#EA580C' : '#94A3B8'} strokeWidth={2} /></div>
            <div style={{ fontSize: 18, fontWeight: 700, color: metricas.psico > 0 ? '#EA580C' : '#94A3B8' }}>{metricas.psico}</div>
            <div style={{ fontSize: 10, color: '#64748B' }}>encam. psico</div>
          </div>
        </div>
      )}

      {/* Seletor ciclo */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '10px 16px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
        {ciclos.map(c => (
          <button key={c} onClick={() => setCicloAtivo(c)} style={{
            padding: '5px 12px', borderRadius: 20, fontSize: 11, border: '0.5px solid rgba(0,0,0,0.12)',
            background: cicloAtivo === c ? '#f97316' : 'transparent', color: cicloAtivo === c ? 'white' : '#666',
            cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'DM Sans,sans-serif'
          }}>{c.replace('Ciclo ', 'C').replace(' - ITA', '').replace(' - IME', '')}</button>
        ))}
      </div>

      <div style={{ padding: 16 }}>
        {loading ? <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>Carregando...</div>
        : erro ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 13, color: '#DC2626', marginBottom: 12 }}>{erro}</div>
            <button onClick={carregar} style={{ padding: '8px 20px', borderRadius: 10, background: '#f97316', color: 'white', border: 'none', fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Tentar novamente</button>
          </div>
        ) : (
          <>
            {/* Stats do grupo */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div className="card" style={{ textAlign: 'center', padding: 12 }}>
                <div style={{ fontSize: 22, fontWeight: 600, color: '#f97316' }}>{cicloData.length}</div>
                <div style={{ fontSize: 10, color: '#999' }}>alunos</div>
              </div>
              <div className="card" style={{ textAlign: 'center', padding: 12 }}>
                <div style={{ fontSize: 22, fontWeight: 600, color: corNota(mediaGrupo) }}>{mediaGrupo.toFixed(1)}</div>
                <div style={{ fontSize: 10, color: '#999' }}>média</div>
              </div>
              <div className="card" style={{ textAlign: 'center', padding: 12 }}>
                <div style={{ fontSize: 22, fontWeight: 600, color: reprovados.length > 0 ? '#DC2626' : '#16A34A' }}>{reprovados.length}</div>
                <div style={{ fontSize: 10, color: '#999' }}>reprov.</div>
              </div>
            </div>

            {/* Alerta reprovados */}
            {reprovados.length > 0 && (
              <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid #DC2626', background: '#FFF8F8' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#DC2626', marginBottom: 8 }}>⚠ Precisam de atenção</div>
                {reprovados.map(r => (
                  <Link key={r.id} href={`/aluno/${r.id_aluno}`} style={{ textDecoration: 'none' }}>
                    <div style={{ fontSize: 13, color: '#1a1a1a', padding: '4px 0', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
                      {r.nome_aluno} <span style={{ fontSize: 11, color: '#DC2626' }}>— {r.motivo_reprovacao || 'Reprovado'}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* Ranking do grupo */}
            <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Ranking do grupo</div>
            {cicloData.map((r, i) => {
              const media = r.media_2fase !== null ? Number(r.media_2fase) : Number(r.media_1fase || 0)
              return (
                <Link key={r.id} href={`/aluno/${r.id_aluno}`} style={{ textDecoration: 'none' }}>
                  <div className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#f97316', flexShrink: 0 }}>
                      {r.classificacao || i + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{r.nome_aluno}</div>
                      <div style={{ display: 'flex', gap: 8, fontSize: 10, color: '#999', marginTop: 2 }}>
                        {r.media_1fase !== null && <span>1ª: {Number(r.media_1fase).toFixed(1)}</span>}
                        {r.nota_matematica !== null && <span>Mat: {Number(r.nota_matematica).toFixed(1)}</span>}
                        {r.nota_fisica !== null && <span>Fís: {Number(r.nota_fisica).toFixed(1)}</span>}
                        {r.nota_quimica !== null && <span>Quí: {Number(r.nota_quimica).toFixed(1)}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: corNota(media) }}>{media.toFixed(1)}</div>
                      <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: r.resultado_ciclo === 'Aprovado' ? '#DCFCE7' : r.resultado_ciclo === 'Reprovado' ? '#FEF2F2' : '#FEF9C3', color: r.resultado_ciclo === 'Aprovado' ? '#14532D' : r.resultado_ciclo === 'Reprovado' ? '#991B1B' : '#713F12' }}>
                        {r.resultado_ciclo === 'Aprovado' ? '✓' : r.resultado_ciclo === 'Reprovado' ? '✗' : '⏳'}
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </>
        )}
      </div>
      <Nav />
    </div>
  )
}
