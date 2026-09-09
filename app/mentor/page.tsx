'use client'
import { useEffect, useState } from 'react'
import { supabase, dbQuery } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import Nav from '@/components/Nav'
import PageHeader from '@/components/PageHeader'
import Link from 'next/link'
import { Clock, Brain, CalendarCheck, Video } from 'lucide-react'

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
        // media_2fase é a média final; cai pra 1f só se 2f ainda não fechou. Zero conta.
        const m = r.media_2fase != null ? Number(r.media_2fase)
                : r.media_1fase != null ? Number(r.media_1fase)
                : 0
        return acc + m
      }, 0) / cicloData.length
    : 0

  return (
    <div style={{ paddingBottom: 80 }}>
      <PageHeader eyebrow="Mentor" title={perfil?.mentor_nome || perfil?.nome || 'Mentor'} actions={
        <button onClick={signOut} style={{ background: 'none', border: '1px solid var(--border-strong)', borderRadius: 9, padding: '7px 13px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: 'var(--text-muted)' }}>Sair</button>
      } />

      {/* Métricas do mês */}
      {metricas !== null && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '12px 16px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
          <div style={{ textAlign: 'center', padding: '12px 8px', borderRadius: 14, background: 'var(--primary-light)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 5 }}><CalendarCheck size={16} color="#f97316" strokeWidth={2.2} /></div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary-dark)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{metricas.sessoes}</div>
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 3 }}>sessões/mês</div>
          </div>
          <div style={{ textAlign: 'center', padding: '12px 8px', borderRadius: 14, background: '#F0FDF4' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 5 }}><Clock size={16} color="#16A34A" strokeWidth={2.2} /></div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--teal-dark)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{metricas.horas}h</div>
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 3 }}>horas/mês</div>
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
            cursor: 'pointer', whiteSpace: 'nowrap'
          }}>{c.replace('Ciclo ', 'C').replace(' - ITA', '').replace(' - IME', '')}</button>
        ))}
      </div>

      <div style={{ padding: 16 }}>
        {loading ? <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>Carregando...</div>
        : erro ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 13, color: '#DC2626', marginBottom: 12 }}>{erro}</div>
            <button onClick={carregar} style={{ padding: '8px 20px', borderRadius: 10, background: '#f97316', color: 'white', border: 'none', fontSize: 13, cursor: 'pointer' }}>Tentar novamente</button>
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
                <div key={r.id} className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Link href={`/aluno/${r.id_aluno}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                      background: (r.classificacao || i + 1) <= 3 ? 'var(--navy)' : 'var(--primary-light)',
                      color: (r.classificacao || i + 1) <= 3 ? '#fff' : 'var(--primary-dark)',
                    }}>
                      {r.classificacao || i + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--navy)', letterSpacing: '-0.01em' }}>{r.nome_aluno}</div>
                      <div style={{ display: 'flex', gap: 8, fontSize: 10, color: '#999', marginTop: 2 }}>
                        {r.media_1fase !== null && <span>1ª: {Number(r.media_1fase).toFixed(1)}</span>}
                        {r.nota_matematica !== null && <span>Mat: {Number(r.nota_matematica).toFixed(1)}</span>}
                        {r.nota_fisica !== null && <span>Fís: {Number(r.nota_fisica).toFixed(1)}</span>}
                        {r.nota_quimica !== null && <span>Quí: {Number(r.nota_quimica).toFixed(1)}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: corNota(media) }}>{media.toFixed(1)}</div>
                      <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: r.resultado_ciclo === 'Aprovado' ? '#DCFCE7' : r.resultado_ciclo === 'Reprovado' ? '#FEF2F2' : '#FEF9C3', color: r.resultado_ciclo === 'Aprovado' ? '#14532D' : r.resultado_ciclo === 'Reprovado' ? '#991B1B' : '#713F12' }}>
                        {r.resultado_ciclo === 'Aprovado' ? '✓' : r.resultado_ciclo === 'Reprovado' ? '✗' : '⏳'}
                      </span>
                    </div>
                  </Link>
                  <Link
                    href={`/videochamada/mentoria-estrategia-${r.id_aluno}`}
                    title="Iniciar videochamada"
                    style={{
                      flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 34, height: 34, borderRadius: 10,
                      background: '#f0fdf4', border: '1px solid #bbf7d0',
                      color: '#16a34a', textDecoration: 'none',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e: any) => e.currentTarget.style.background = '#dcfce7'}
                    onMouseLeave={(e: any) => e.currentTarget.style.background = '#f0fdf4'}
                  >
                    <Video size={15} strokeWidth={2} />
                  </Link>
                </div>
              )
            })}
          </>
        )}
      </div>
      <Nav />
    </div>
  )
}
