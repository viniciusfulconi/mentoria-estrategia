'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { dbQuery } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Printer } from 'lucide-react'

function fmt(v: any) {
  const n = Number(v)
  return !v || isNaN(n) || n === 0 ? '—' : n.toFixed(1)
}

function mediaArr(lista: any[], campo: string) {
  const vals = lista.map(r => Number(r[campo])).filter(v => v > 0)
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
}

function corNota(n: number) {
  return n >= 7 ? '#16A34A' : n >= 5 ? '#2563EB' : '#DC2626'
}

export default function RelatorioAluno() {
  const params = useParams()
  const router = useRouter()
  const { perfil: meuPerfil } = useAuth()
  const id = params?.id as string

  const [rankings, setRankings] = useState<any[]>([])
  const [alunoInfo, setAlunoInfo] = useState<any>(null)
  const [perfilAluno, setPerfilAluno] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const dataGeracao = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  useEffect(() => {
    if (!meuPerfil) return
    if (meuPerfil.papel === 'aluno') {
      router.replace(`/aluno/${meuPerfil.aluno_id}`)
    }
  }, [meuPerfil])

  useEffect(() => {
    if (!id) return
    Promise.all([
      dbQuery('resultados', { id_aluno: `eq.${id}`, fase: 'eq.ranking', order: 'ciclo_nome' }),
      dbQuery('alunos_dados', { id_aluno: `eq.${id}` }),
      dbQuery('perfis', { aluno_id: `eq.${id}` }),
    ]).then(([{ data: r }, { data: a }, { data: p }]) => {
      setRankings(r || [])
      setAlunoInfo(a?.[0] || null)
      setPerfilAluno(p?.[0] || null)
      setLoading(false)
    })
  }, [id])

  if (loading) return (
    <div style={{ padding: 60, textAlign: 'center', color: '#999', fontFamily: 'DM Sans, sans-serif' }}>
      Preparando relatório...
    </div>
  )

  const nomeAluno = alunoInfo?.nome || perfilAluno?.nome || '—'
  const mentor = alunoInfo?.mentor || '—'
  const iniciais = nomeAluno.split(' ').map((w: string) => w[0]).slice(0, 2).join('')

  const totalCiclos = rankings.length
  const aprovados = rankings.filter(r => r.resultado_ciclo === 'Aprovado').length
  const reprovados = rankings.filter(r => r.resultado_ciclo === 'Reprovado').length
  const txAprov = totalCiclos ? Math.round(aprovados / totalCiclos * 100) : 0

  const m1fase = mediaArr(rankings, 'media_1fase')
  const mMat   = mediaArr(rankings, 'nota_matematica')
  const mFis   = mediaArr(rankings, 'nota_fisica')
  const mQui   = mediaArr(rankings, 'nota_quimica')
  const mPort  = mediaArr(rankings, 'media_linguagens')
  const m2fase = mediaArr(rankings, 'media_2fase')

  const mediasDisc = [
    { label: 'Matemática', value: mMat },
    { label: 'Física',     value: mFis },
    { label: 'Química',    value: mQui },
    { label: 'Port./Red.', value: mPort },
  ].filter(s => s.value !== null) as { label: string; value: number }[]

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif; background: #F8FAFC; }
        @page { size: A4 portrait; margin: 14mm 18mm; }
        @media print {
          body { background: white; }
          .no-print { display: none !important; }
          .report-wrap { padding: 0 !important; box-shadow: none !important; }
        }
        table { width: 100%; border-collapse: collapse; }
        thead th {
          background: #1E3A5F; color: white;
          font-size: 10px; font-weight: 600; letter-spacing: 0.04em;
          padding: 8px 10px; text-align: center;
        }
        thead th:first-child { text-align: left; border-radius: 0; }
        tbody td {
          border-bottom: 0.5px solid #E2E8F0;
          font-size: 11.5px; padding: 8px 10px; text-align: center; color: #334155;
        }
        tbody td:first-child { text-align: left; font-weight: 500; }
        tbody tr:last-child td { border-bottom: none; }
        tbody tr:hover td { background: #F8FAFC; }
        .media-row td {
          background: #EFF6FF !important;
          font-weight: 700; color: #1E3A5F;
          border-top: 1.5px solid #2563EB;
          border-bottom: none;
        }
      `}</style>

      {/* Floating actions */}
      <div className="no-print" style={{
        position: 'fixed', top: 16, right: 16, zIndex: 200,
        display: 'flex', gap: 8, alignItems: 'center',
      }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 10, padding: '9px 16px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: '#555' }}
        >
          ← Voltar
        </button>
        <button
          onClick={() => window.print()}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#2563EB', color: 'white', border: 'none',
            borderRadius: 10, padding: '9px 20px', fontSize: 13,
            fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 2px 10px rgba(37,99,235,0.35)',
          }}
        >
          <Printer size={15} strokeWidth={2} />
          Imprimir / Salvar PDF
        </button>
      </div>

      {/* Report */}
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '48px 32px 60px' }}>
        <div className="report-wrap" style={{ background: 'white', borderRadius: 16, padding: '36px 40px', boxShadow: '0 1px 24px rgba(0,0,0,0.08)' }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, paddingBottom: 22, borderBottom: '2px solid #1E3A5F' }}>
            <div>
              <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
                Estratégia Concursos · Programa de Mentoria
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#1E3A5F', lineHeight: 1.15 }}>
                Relatório de Desempenho
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 2 }}>Gerado em</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>{dataGeracao}</div>
            </div>
          </div>

          {/* Student + mentor info */}
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: 24, alignItems: 'center', marginBottom: 28 }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: '#1E40AF', flexShrink: 0 }}>
              {iniciais}
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Aluno</div>
              <div style={{ fontSize: 19, fontWeight: 800, color: '#0F172A', marginBottom: 3 }}>{nomeAluno}</div>
              {perfilAluno?.email && <div style={{ fontSize: 12, color: '#64748B' }}>{perfilAluno.email}</div>}
              {perfilAluno?.cidade && <div style={{ fontSize: 12, color: '#64748B' }}>{perfilAluno.cidade}</div>}
              {perfilAluno?.modalidade && (
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                  {perfilAluno.modalidade === 'presencial' ? 'Presencial' : 'Online'}
                </div>
              )}
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Mentor</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 2 }}>{mentor}</div>
            </div>
          </div>

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 32 }}>
            {[
              { label: 'Ciclos avaliados', value: totalCiclos, color: '#2563EB', bg: '#EFF6FF' },
              { label: 'Aprovações',        value: aprovados,   color: '#16A34A', bg: '#F0FDF4' },
              { label: 'Reprovações',       value: reprovados,  color: reprovados > 0 ? '#DC2626' : '#94A3B8', bg: reprovados > 0 ? '#FEF2F2' : '#F8FAFC' },
              { label: 'Taxa de aprovação', value: `${txAprov}%`, color: txAprov >= 70 ? '#16A34A' : txAprov >= 50 ? '#D97706' : '#DC2626', bg: '#F8FAFC' },
            ].map(s => (
              <div key={s.label} style={{ background: s.bg, border: '0.5px solid #E2E8F0', borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 4, fontWeight: 500 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Grades table */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1E3A5F', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Notas por Ciclo
            </div>
            <div style={{ borderRadius: 12, overflow: 'hidden', border: '0.5px solid #E2E8F0' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '20%', textAlign: 'left', paddingLeft: 14 }}>Ciclo</th>
                    <th>1ª Fase</th>
                    <th>Mat.</th>
                    <th>Fís.</th>
                    <th>Quí.</th>
                    <th>Port./Red.</th>
                    <th>Média 2ª</th>
                    <th>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {rankings.map((r, i) => {
                    const aprovado  = r.resultado_ciclo === 'Aprovado'
                    const reprovado = r.resultado_ciclo === 'Reprovado'
                    const bg = i % 2 === 0 ? 'white' : '#FAFBFC'
                    return (
                      <tr key={r.ciclo_nome} style={{ background: bg }}>
                        <td style={{ paddingLeft: 14, color: '#1E293B' }}>
                          {String(r.ciclo_nome).replace(' - ITA', '').replace(' - IME', '')}
                        </td>
                        <td>{fmt(r.media_1fase)}</td>
                        <td>{fmt(r.nota_matematica)}</td>
                        <td>{fmt(r.nota_fisica)}</td>
                        <td>{fmt(r.nota_quimica)}</td>
                        <td>{fmt(r.media_linguagens)}</td>
                        <td style={{ fontWeight: 600 }}>{fmt(r.media_2fase)}</td>
                        <td style={{ fontWeight: 600, color: aprovado ? '#15803D' : reprovado ? '#DC2626' : '#64748B' }}>
                          {aprovado ? '✓ Aprovado' : reprovado ? '✗ Reprovado' : r.resultado_ciclo || '—'}
                        </td>
                      </tr>
                    )
                  })}
                  {rankings.length > 1 && (
                    <tr className="media-row">
                      <td style={{ paddingLeft: 14 }}>Média Geral</td>
                      <td>{m1fase ? m1fase.toFixed(1) : '—'}</td>
                      <td>{mMat  ? mMat.toFixed(1)  : '—'}</td>
                      <td>{mFis  ? mFis.toFixed(1)  : '—'}</td>
                      <td>{mQui  ? mQui.toFixed(1)  : '—'}</td>
                      <td>{mPort ? mPort.toFixed(1) : '—'}</td>
                      <td>{m2fase ? m2fase.toFixed(1) : '—'}</td>
                      <td style={{ color: aprovados >= reprovados ? '#15803D' : '#DC2626' }}>
                        {aprovados}/{totalCiclos} aprov.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Per-subject averages */}
          {mediasDisc.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1E3A5F', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Médias por Disciplina — 2ª Fase
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${mediasDisc.length}, 1fr)`, gap: 10 }}>
                {mediasDisc.map(s => {
                  const cor = corNota(s.value)
                  const pct = Math.min(100, (s.value / 10) * 100)
                  return (
                    <div key={s.label} style={{ border: '0.5px solid #E2E8F0', borderRadius: 12, padding: '14px 16px' }}>
                      <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 500, marginBottom: 8 }}>{s.label}</div>
                      <div style={{ fontSize: 26, fontWeight: 800, color: cor, lineHeight: 1, marginBottom: 10 }}>{s.value.toFixed(1)}</div>
                      <div style={{ height: 5, background: '#F1F5F9', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: cor, borderRadius: 3 }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Ciclo-by-ciclo evolution bar */}
          {rankings.length > 1 && m2fase !== null && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1E3A5F', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Evolução da Média Geral por Ciclo
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {rankings.map(r => {
                  const m1 = Number(r.media_1fase || 0)
                  const m2 = r.media_2fase != null ? Number(r.media_2fase) : null
                  const media = m2 !== null ? (m1 + m2) / 2 : m1
                  if (!media) return null
                  const cor = corNota(media)
                  const pct = Math.min(100, (media / 10) * 100)
                  const label = String(r.ciclo_nome).replace(' - ITA', '').replace(' - IME', '')
                  return (
                    <div key={r.ciclo_nome} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 110, fontSize: 11, color: '#64748B', textAlign: 'right', flexShrink: 0 }}>{label}</div>
                      <div style={{ flex: 1, height: 18, background: '#F1F5F9', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: cor, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6 }}>
                          {pct > 20 && <span style={{ fontSize: 10, fontWeight: 700, color: 'white' }}>{media.toFixed(1)}</span>}
                        </div>
                      </div>
                      {pct <= 20 && <div style={{ fontSize: 10, fontWeight: 700, color: cor, width: 28 }}>{media.toFixed(1)}</div>}
                      <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 6, flexShrink: 0,
                        background: r.resultado_ciclo === 'Aprovado' ? '#DCFCE7' : r.resultado_ciclo === 'Reprovado' ? '#FEF2F2' : '#F1F5F9',
                        color: r.resultado_ciclo === 'Aprovado' ? '#15803D' : r.resultado_ciclo === 'Reprovado' ? '#DC2626' : '#64748B',
                      }}>
                        {r.resultado_ciclo === 'Aprovado' ? '✓' : r.resultado_ciclo === 'Reprovado' ? '✗' : '—'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Footer */}
          <div style={{ marginTop: 36, paddingTop: 16, borderTop: '0.5px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#CBD5E1' }}>
            <span>Estratégia Concursos — Plataforma de Mentoria</span>
            <span>ID: {id?.slice(0, 8)}</span>
          </div>

        </div>
      </div>
    </>
  )
}
