'use client'
import { useEffect, useState } from 'react'
import { dbQuery } from '@/lib/supabase'
import Nav from '@/components/Nav'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { PesquisaCsat, RespostaCsat } from '@/lib/supabase'

const CRITERIOS = [
  { key: 'qualidade_atendimento', label: 'Qualidade dos atendimentos' },
  { key: 'organizacao_planejamento', label: 'Organização e planejamento' },
  { key: 'diferencial_mentoria', label: 'Diferencial da mentoria' },
  { key: 'clareza_orientacoes', label: 'Clareza e objetividade' },
  { key: 'acompanhamento_cobranca', label: 'Acompanhamento e cobrança' },
  { key: 'comunicacao_relacao', label: 'Comunicação e relação' },
]

function mediaNotas(respostas: any[], campo: string): number {
  const vals = respostas.map(r => Number(r[campo])).filter(v => v > 0)
  if (!vals.length) return 0
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

function mediaGeral(respostas: any[]): number {
  const todas = CRITERIOS.map(c => mediaNotas(respostas, c.key)).filter(v => v > 0)
  if (!todas.length) return 0
  return todas.reduce((a, b) => a + b, 0) / todas.length
}

function BadgeMedia({ media }: { media: number }) {
  const cor = media > 4.5 ? '#16A34A' : media >= 4.0 ? '#D97706' : '#DC2626'
  const bg = media > 4.5 ? '#DCFCE7' : media >= 4.0 ? '#FFFBEB' : '#FEF2F2'
  const texto = media > 4.5 ? 'Muito bom' : media >= 4.0 ? 'Bom, mas com pontos de melhoria' : 'Sinal de alerta'
  return (
    <div style={{ background: bg, borderRadius: 14, padding: '16px 20px', textAlign: 'center', border: `1.5px solid ${cor}20` }}>
      <div style={{ fontSize: 36, fontWeight: 800, color: cor, lineHeight: 1 }}>{media.toFixed(2)}</div>
      <div style={{ fontSize: 11, color: cor, fontWeight: 600, marginTop: 4 }}>{texto}</div>
      <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>de 5,0</div>
    </div>
  )
}

function CriterioBar({ label, media }: { label: string, media: number }) {
  const pct = (media / 5) * 100
  const cor = media > 4.5 ? '#16A34A' : media >= 4.0 ? '#D97706' : '#DC2626'
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: '#555' }}>{label}</span>
        <span style={{ fontWeight: 700, color: cor }}>{media.toFixed(2)}</span>
      </div>
      <div style={{ height: 7, background: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: cor, borderRadius: 4, transition: 'width 0.5s' }} />
      </div>
    </div>
  )
}

function LineChart({ pesquisas, dados }: { pesquisas: string[], dados: number[] }) {
  if (pesquisas.length < 2) return null
  const w = 300, h = 120, pad = 30
  const max = 5, min = 0
  const xStep = (w - pad * 2) / (pesquisas.length - 1)
  const yScale = (v: number) => h - pad - ((v - min) / (max - min)) * (h - pad * 2)
  const points = dados.map((v, i) => [pad + i * xStep, yScale(v)])
  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ marginTop: 8 }}>
      {[1,2,3,4,5].map(v => (
        <line key={v} x1={pad} y1={yScale(v)} x2={w-pad} y2={yScale(v)} stroke="rgba(0,0,0,0.06)" strokeWidth="1" />
      ))}
      <path d={path} fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d={`${path} L${points[points.length-1][0]},${h-pad} L${pad},${h-pad} Z`} fill="#2563EB" fillOpacity="0.08" />
      {points.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="4" fill="#2563EB" stroke="white" strokeWidth="1.5" />
          <text x={x} y={y - 8} textAnchor="middle" fontSize="9" fontWeight="700" fill="#2563EB">{dados[i].toFixed(1)}</text>
          <text x={x} y={h - 6} textAnchor="middle" fontSize="7" fill="#999">{pesquisas[i].split('—')[0].trim().replace('Pesquisa ', 'P')}</text>
        </g>
      ))}
    </svg>
  )
}

export default function CSAT() {
  const router = useRouter()
  const [pesquisas, setPesquisas] = useState<PesquisaCsat[]>([])
  const [respostas, setRespostas] = useState<RespostaCsat[]>([])
  const [pesquisaAtiva, setPesquisaAtiva] = useState<string>('todas')
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  async function carregar() {
    setErro(null)
    const [{ data: ps, error: e1 }, { data: rs, error: e2 }] = await Promise.all([
      dbQuery('pesquisas_csat', { order: 'data' }),
      dbQuery('respostas_csat'),
    ])
    if (e1 || e2) { setErro('Falha ao carregar dados de CSAT.'); setLoading(false); return }
    setPesquisas(ps || [])
    setRespostas(rs || [])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  const respostasFiltradas = pesquisaAtiva === 'todas'
    ? respostas
    : respostas.filter(r => r.pesquisa_id === pesquisaAtiva)

  const mentores = [...new Set(respostas.map(r => r.mentor))].sort()

  const mediaGeralGeral = mediaGeral(respostasFiltradas)

  // Evolução geral por pesquisa para gráfico de linha
  const evolucaoGeral = pesquisas.map(p => {
    const rs = respostas.filter(r => r.pesquisa_id === p.id)
    return mediaGeral(rs)
  })

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 17, fontWeight: 600 }}>CSAT — Satisfação</div>
          <Link href="/csat/upload" style={{ textDecoration: 'none', background: '#2563EB', color: 'white', borderRadius: 10, padding: '7px 14px', fontSize: 13, fontWeight: 500 }}>↑ Upload</Link>
        </div>
        {/* Seletor de pesquisa */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
          <button onClick={() => setPesquisaAtiva('todas')} style={{
            padding: '4px 12px', borderRadius: 16, fontSize: 11, border: 'none',
            background: pesquisaAtiva === 'todas' ? '#2563EB' : '#F1F5F9',
            color: pesquisaAtiva === 'todas' ? 'white' : '#666',
            cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'DM Sans,sans-serif'
          }}>Geral</button>
          {pesquisas.map(p => (
            <button key={p.id} onClick={() => setPesquisaAtiva(p.id)} style={{
              padding: '4px 12px', borderRadius: 16, fontSize: 11, border: 'none',
              background: pesquisaAtiva === p.id ? '#2563EB' : '#F1F5F9',
              color: pesquisaAtiva === p.id ? 'white' : '#666',
              cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'DM Sans,sans-serif'
            }}>{p.nome}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>Carregando...</div>
        ) : erro ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 13, color: '#DC2626', marginBottom: 12 }}>{erro}</div>
            <button onClick={carregar} style={{ padding: '8px 20px', borderRadius: 10, background: '#2563EB', color: 'white', border: 'none', fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Tentar novamente</button>
          </div>
        ) : respostas.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40, color: '#999' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
            <div style={{ marginBottom: 16 }}>Nenhuma pesquisa importada ainda.</div>
            <Link href="/csat/upload" style={{ textDecoration: 'none', background: '#2563EB', color: 'white', borderRadius: 12, padding: '10px 20px', fontSize: 14 }}>
              Importar primeira pesquisa
            </Link>
          </div>
        ) : (
          <>
            {/* Média geral */}
            <div style={{ marginBottom: 14 }}>
              <BadgeMedia media={mediaGeralGeral} />
              <div style={{ fontSize: 11, color: '#999', textAlign: 'center', marginTop: 6 }}>
                {respostasFiltradas.length} respostas · {mentores.length} mentores
              </div>
            </div>

            {/* Gráfico de evolução */}
            {pesquisas.length >= 2 && pesquisaAtiva === 'todas' && (
              <div className="card" style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Evolução geral</div>
                <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>Média geral por pesquisa</div>
                <LineChart pesquisas={pesquisas.map(p => p.nome)} dados={evolucaoGeral} />
              </div>
            )}

            {/* Critérios */}
            <div className="card" style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Por critério</div>
              {CRITERIOS.map(c => (
                <CriterioBar key={c.key} label={c.label} media={mediaNotas(respostasFiltradas, c.key)} />
              ))}
            </div>

            {/* Ranking de mentores */}
            <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Ranking de mentores</div>
            {mentores
              .map(m => ({ nome: m, media: mediaGeral(respostasFiltradas.filter(r => r.mentor === m)) }))
              .sort((a, b) => b.media - a.media)
              .map((m, i) => {
                const cor = m.media > 4.5 ? '#16A34A' : m.media >= 4.0 ? '#D97706' : '#DC2626'
                return (
                  <Link key={m.nome} href={`/csat/mentor/${encodeURIComponent(m.nome)}`} style={{ textDecoration: 'none' }}>
                    <div className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#2563EB', flexShrink: 0 }}>
                        {i + 1}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 500 }}>{m.nome}</div>
                        <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                          {respostasFiltradas.filter(r => r.mentor === m.nome).length} avaliações
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: cor }}>{m.media.toFixed(2)}</div>
                        <div style={{ fontSize: 9, color: cor }}>/ 5,0</div>
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
