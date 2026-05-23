// @ts-nocheck
'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Nav from '@/components/Nav'
import { useParams, useRouter } from 'next/navigation'

const CRITERIOS = [
  { key: 'qualidade_atendimento', label: 'Qualidade dos atendimentos', icon: '⭐' },
  { key: 'organizacao_planejamento', label: 'Organização e planejamento', icon: '📋' },
  { key: 'diferencial_mentoria', label: 'Diferencial da mentoria', icon: '🚀' },
  { key: 'clareza_orientacoes', label: 'Clareza e objetividade', icon: '🎯' },
  { key: 'acompanhamento_cobranca', label: 'Acompanhamento e cobrança', icon: '📊' },
  { key: 'comunicacao_relacao', label: 'Comunicação e relação', icon: '💬' },
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

function corMedia(m: number) { return m > 4.5 ? '#16A34A' : m >= 4.0 ? '#D97706' : '#DC2626' }
function bgMedia(m: number) { return m > 4.5 ? '#DCFCE7' : m >= 4.0 ? '#FFFBEB' : '#FEF2F2' }
function textoMedia(m: number) { return m > 4.5 ? 'Muito bom' : m >= 4.0 ? 'Bom, mas com pontos de melhoria' : 'Sinal de alerta' }

function StarRating({ value, max = 5 }: { value: number, max?: number }) {
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {Array.from({ length: max }, (_, i) => (
        <div key={i} style={{
          width: 20, height: 20, borderRadius: 4,
          background: i < Math.round(value) ? '#D97706' : '#F1F5F9',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12
        }}>
          {i < Math.round(value) ? '★' : '☆'}
        </div>
      ))}
    </div>
  )
}

function LineChart({ pesquisas, dados, label }: { pesquisas: string[], dados: number[], label: string }) {
  if (pesquisas.length < 2) return null
  const w = 300, h = 100, pad = 28
  const max = 5, min = 0
  const xStep = (w - pad * 2) / (pesquisas.length - 1)
  const yScale = (v: number) => h - pad - ((v - min) / (max - min)) * (h - pad * 2)
  const points = dados.map((v, i) => [pad + i * xStep, yScale(v)])
  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ')
  const cor = dados.length ? corMedia(dados[dados.length - 1]) : '#2563EB'
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%">
      {[2,3,4,5].map(v => (
        <line key={v} x1={pad} y1={yScale(v)} x2={w-pad} y2={yScale(v)} stroke="rgba(0,0,0,0.05)" strokeWidth="1" />
      ))}
      <path d={`${path} L${points[points.length-1][0]},${h-pad} L${pad},${h-pad} Z`} fill={cor} fillOpacity="0.08" />
      <path d={path} fill="none" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="4" fill={cor} stroke="white" strokeWidth="1.5" />
          <text x={x} y={y - 7} textAnchor="middle" fontSize="8" fontWeight="700" fill={cor}>{dados[i].toFixed(1)}</text>
          <text x={x} y={h - 4} textAnchor="middle" fontSize="7" fill="#bbb">{pesquisas[i].replace('Pesquisa ', 'P').split('—')[0].trim()}</text>
        </g>
      ))}
    </svg>
  )
}

function RadarMentor({ dados }: { dados: { label: string, value: number }[] }) {
  const n = dados.length
  const cx = 130, cy = 130, raio = 95
  const max = 5
  const niveis = [1, 2, 3, 4, 5]

  function pontoEixo(idx: number, r: number): [number, number] {
    const angulo = (Math.PI * 2 * idx) / n - Math.PI / 2
    return [cx + r * Math.cos(angulo), cy + r * Math.sin(angulo)]
  }

  const pontos = dados.map((d, i) => pontoEixo(i, (d.value / max) * raio))
  const polyPath = pontos.map(([x, y]) => `${x},${y}`).join(' ')
  const mediaG = dados.reduce((a, b) => a + b.value, 0) / dados.length
  const cor = corMedia(mediaG)

  return (
    <svg viewBox="0 0 260 260" width="100%" style={{ maxWidth: 260, margin: '0 auto', display: 'block' }}>
      {niveis.map(nivel => {
        const ps = dados.map((_, i) => pontoEixo(i, (nivel / max) * raio))
        const path = ps.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ') + 'Z'
        return <path key={nivel} d={path} fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth="1" />
      })}
      {dados.map((_, i) => {
        const [x, y] = pontoEixo(i, raio)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(0,0,0,0.07)" strokeWidth="1" />
      })}
      <polygon points={polyPath} fill={cor} fillOpacity="0.15" stroke={cor} strokeWidth="2" />
      {pontos.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="4" fill={cor} stroke="white" strokeWidth="1.5" />
          <text x={x} y={y - 7} textAnchor="middle" fontSize="8" fontWeight="700" fill={cor}>{dados[i].value.toFixed(1)}</text>
        </g>
      ))}
      {dados.map((d, i) => {
        const [x, y] = pontoEixo(i, raio + 18)
        const shortLabel = d.label.split(' ').slice(0, 2).join(' ')
        return (
          <text key={i} x={x} y={y} textAnchor="middle" fontSize="9" fontWeight="600" fill="#555" dominantBaseline="middle">
            {shortLabel}
          </text>
        )
      })}
    </svg>
  )
}

export default function MentorCSAT() {
  const params = useParams()
  const router = useRouter()
  const nome = decodeURIComponent(params?.nome as string)

  const [pesquisas, setPesquisas] = useState<any[]>([])
  const [respostas, setRespostas] = useState<any[]>([])
  const [perfil, setPerfil] = useState<any>(null)
  const [pesquisaAtiva, setPesquisaAtiva] = useState<string>('todas')
  const [abaFeedback, setAbaFeedback] = useState<'ajuda' | 'melhorar'>('ajuda')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('pesquisas_csat').select('*').order('data'),
      supabase.from('respostas_csat').select('*').eq('mentor', nome),
      supabase.from('perfis').select('*').eq('mentor_nome', nome).single(),
    ]).then(([{ data: ps }, { data: rs }, { data: pf }]) => {
      setPesquisas(ps || [])
      setRespostas(rs || [])
      setPerfil(pf)
      setLoading(false)
    })
  }, [nome])

  const respostasFiltradas = pesquisaAtiva === 'todas'
    ? respostas
    : respostas.filter(r => r.pesquisa_id === pesquisaAtiva)

  const media = mediaGeral(respostasFiltradas)
  const cor = corMedia(media)
  const bg = bgMedia(media)
  const texto = textoMedia(media)

  // Evolução por pesquisa (para gráfico de linha)
  const evolucao = pesquisas.map(p => ({
    nome: p.nome,
    media: mediaGeral(respostas.filter(r => r.pesquisa_id === p.id))
  })).filter(e => e.media > 0)

  // Dados radar
  const dadosRadar = CRITERIOS.map(c => ({
    label: c.label, value: mediaNotas(respostasFiltradas, c.key)
  })).filter(d => d.value > 0)

  // Feedbacks
  const feedbacksAjuda = respostasFiltradas.map(r => r.o_que_ajuda).filter(f => f && f.trim() && f !== '.')
  const feedbacksMelhorar = respostasFiltradas.map(r => r.o_que_melhorar).filter(f => f && f.trim() && f !== '.')

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>Carregando...</div>

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{nome}</div>
          <div style={{ fontSize: 11, color: '#999' }}>Avaliação de satisfação</div>
        </div>
      </div>

      {/* Seletor pesquisa */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '8px 16px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
        <button onClick={() => setPesquisaAtiva('todas')} style={{ padding: '4px 12px', borderRadius: 16, fontSize: 11, border: 'none', background: pesquisaAtiva === 'todas' ? '#2563EB' : '#F1F5F9', color: pesquisaAtiva === 'todas' ? 'white' : '#666', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'DM Sans,sans-serif' }}>Geral</button>
        {pesquisas.filter(p => respostas.some(r => r.pesquisa_id === p.id)).map(p => (
          <button key={p.id} onClick={() => setPesquisaAtiva(p.id)} style={{ padding: '4px 12px', borderRadius: 16, fontSize: 11, border: 'none', background: pesquisaAtiva === p.id ? '#2563EB' : '#F1F5F9', color: pesquisaAtiva === p.id ? 'white' : '#666', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'DM Sans,sans-serif' }}>{p.nome}</button>
        ))}
      </div>

      <div style={{ padding: 16 }}>
        {/* Foto + média geral */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            {perfil?.foto_url ? (
              <img src={perfil.foto_url} alt={nome} style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            ) : (
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, color: '#1E40AF', flexShrink: 0 }}>
                {nome.split(' ').map(w => w[0]).slice(0, 2).join('')}
              </div>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{nome}</div>
              <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>{respostasFiltradas.length} avaliações</div>
              <StarRating value={media} />
            </div>
          </div>

          {/* Badge média */}
          <div style={{ background: bg, borderRadius: 12, padding: '14px 16px', textAlign: 'center', border: `1.5px solid ${cor}30` }}>
            <div style={{ fontSize: 40, fontWeight: 800, color: cor, lineHeight: 1 }}>{media.toFixed(2)}</div>
            <div style={{ fontSize: 12, color: cor, fontWeight: 600, marginTop: 4 }}>{texto}</div>
            <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>média geral / 5,0</div>
          </div>
        </div>

        {/* Radar */}
        {dadosRadar.length > 2 && (
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Perfil de avaliação</div>
            <RadarMentor dados={dadosRadar} />
          </div>
        )}

        {/* Critérios detalhados */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Por critério</div>
          {CRITERIOS.map(c => {
            const m = mediaNotas(respostasFiltradas, c.key)
            const pct = (m / 5) * 100
            const co = corMedia(m)
            return (
              <div key={c.key} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: '#555' }}>{c.icon} {c.label}</span>
                  <span style={{ fontWeight: 700, color: co }}>{m.toFixed(2)}</span>
                </div>
                <div style={{ height: 8, background: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: co, borderRadius: 4, transition: 'width 0.5s' }} />
                </div>
              </div>
            )
          })}
        </div>

        {/* Gráfico de evolução */}
        {evolucao.length >= 2 && (
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Evolução por pesquisa</div>
            <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>Média geral ao longo do tempo</div>
            <LineChart pesquisas={evolucao.map(e => e.nome)} dados={evolucao.map(e => e.media)} label="Média geral" />
            {/* Evolução por critério */}
            {CRITERIOS.map(c => {
              const evolCrit = pesquisas.map(p => ({
                nome: p.nome,
                val: mediaNotas(respostas.filter(r => r.pesquisa_id === p.id), c.key)
              })).filter(e => e.val > 0)
              if (evolCrit.length < 2) return null
              return (
                <div key={c.key} style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#666', marginBottom: 4 }}>{c.icon} {c.label}</div>
                  <LineChart pesquisas={evolCrit.map(e => e.nome)} dados={evolCrit.map(e => e.val)} label={c.label} />
                </div>
              )
            })}
          </div>
        )}

        {/* Feedbacks */}
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Feedbacks dos alunos</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {[
              { id: 'ajuda', label: `✅ O que ajuda (${feedbacksAjuda.length})` },
              { id: 'melhorar', label: `💡 O que melhorar (${feedbacksMelhorar.length})` },
            ].map(a => (
              <button key={a.id} onClick={() => setAbaFeedback(a.id as any)} style={{
                padding: '5px 12px', borderRadius: 16, fontSize: 11, border: 'none',
                background: abaFeedback === a.id ? '#1a1a1a' : '#F1F5F9',
                color: abaFeedback === a.id ? 'white' : '#666',
                cursor: 'pointer', fontFamily: 'DM Sans,sans-serif'
              }}>{a.label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(abaFeedback === 'ajuda' ? feedbacksAjuda : feedbacksMelhorar).map((f, i) => (
              <div key={i} style={{ background: '#F7F6F3', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#444', lineHeight: 1.5, borderLeft: `3px solid ${abaFeedback === 'ajuda' ? '#16A34A' : '#2563EB'}` }}>
                "{f}"
              </div>
            ))}
            {(abaFeedback === 'ajuda' ? feedbacksAjuda : feedbacksMelhorar).length === 0 && (
              <div style={{ textAlign: 'center', color: '#bbb', padding: 20, fontSize: 13 }}>Nenhum feedback nesta pesquisa</div>
            )}
          </div>
        </div>
      </div>
      <Nav />
    </div>
  )
}
