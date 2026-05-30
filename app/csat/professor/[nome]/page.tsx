'use client'
import { useEffect, useState } from 'react'
import { dbQuery } from '@/lib/supabase'
import Nav from '@/components/Nav'
import { useParams, useRouter } from 'next/navigation'

// Ritmo fica fora da média — é info complementar
const CRITERIOS = [
  { key: 'dominio_conteudo',         label: 'Domínio do conteúdo',        icon: '📚' },
  { key: 'clareza_explicacao',       label: 'Clareza das explicações',     icon: '💡' },
  { key: 'teoria_exercicios',        label: 'Teoria e exercícios',         icon: '📝' },
  { key: 'organizacao_quadro',       label: 'Organização do quadro',       icon: '🗂️' },
  { key: 'respeito_alunos',          label: 'Respeito aos alunos',         icon: '🤝' },
  { key: 'acessibilidade_duvidas',   label: 'Acessibilidade p/ dúvidas',   icon: '🙋' },
  { key: 'cumprimento_horarios',     label: 'Cumprimento de horários',     icon: '🕐' },
  { key: 'contribuicao_aprendizado', label: 'Contribuição ao aprendizado', icon: '🚀' },
  { key: 'adequacao_listas',         label: 'Adequação das listas',        icon: '📋' },
]

const RITMO_LABELS: Record<number, string> = { 1: 'Muito lento', 2: 'Lento', 3: 'Normal', 4: 'Rápido', 5: 'Muito rápido' }

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

function StarRating({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {Array.from({ length: max }, (_, i) => (
        <div
          key={i}
          style={{
            width: 20, height: 20, borderRadius: 4,
            background: i < Math.round(value) ? '#D97706' : '#F1F5F9',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
          }}
        >
          {i < Math.round(value) ? '★' : '☆'}
        </div>
      ))}
    </div>
  )
}

function LineChart({ labels, dados }: { labels: string[]; dados: number[] }) {
  if (labels.length < 2) return null
  const w = 300, h = 100, pad = 28
  const max = 5, min = 0
  const xStep = (w - pad * 2) / (labels.length - 1)
  const yScale = (v: number) => h - pad - ((v - min) / (max - min)) * (h - pad * 2)
  const points = dados.map((v, i) => [pad + i * xStep, yScale(v)])
  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ')
  const cor = dados.length ? corMedia(dados[dados.length - 1]) : '#2563EB'
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%">
      {[2, 3, 4, 5].map(v => (
        <line key={v} x1={pad} y1={yScale(v)} x2={w - pad} y2={yScale(v)} stroke="rgba(0,0,0,0.05)" strokeWidth="1" />
      ))}
      <path d={`${path} L${points[points.length - 1][0]},${h - pad} L${pad},${h - pad} Z`} fill={cor} fillOpacity="0.08" />
      <path d={path} fill="none" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="4" fill={cor} stroke="white" strokeWidth="1.5" />
          <text x={x} y={y - 7} textAnchor="middle" fontSize="8" fontWeight="700" fill={cor}>{dados[i].toFixed(1)}</text>
          <text x={x} y={h - 4} textAnchor="middle" fontSize="7" fill="#bbb">{labels[i].split('—')[0].trim()}</text>
        </g>
      ))}
    </svg>
  )
}

function RadarProfessor({ dados }: { dados: { label: string; value: number }[] }) {
  const n = dados.length
  const cx = 130, cy = 130, raio = 95
  const max = 5

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
      {[1, 2, 3, 4, 5].map(nivel => {
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
          <text key={i} x={x} y={y} textAnchor="middle" fontSize="8" fontWeight="600" fill="#555" dominantBaseline="middle">
            {shortLabel}
          </text>
        )
      })}
    </svg>
  )
}

export default function ProfessorCSAT() {
  const params = useParams()
  const router = useRouter()
  const nome = decodeURIComponent(params?.nome as string)

  const [avaliacoes, setAvaliacoes] = useState<any[]>([])
  const [respostas, setRespostas] = useState<any[]>([])
  const [avaliacaoAtiva, setAvaliacaoAtiva] = useState<string>('todas')
  const [materiaAtiva, setMateriaAtiva] = useState<string>('todas')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      dbQuery('avaliacoes_professores', { order: 'data' }),
      dbQuery('respostas_professor', { professor: `eq.${nome}` }),
    ]).then(([{ data: avs }, { data: rs }]) => {
      setAvaliacoes(avs || [])
      setRespostas(rs || [])
      setLoading(false)
    })
  }, [nome])

  const materias = [...new Set(respostas.map(r => r.materia))].sort()

  const respostasFiltradas = respostas.filter(r => {
    if (materiaAtiva !== 'todas' && r.materia !== materiaAtiva) return false
    if (avaliacaoAtiva !== 'todas' && r.avaliacao_id !== avaliacaoAtiva) return false
    return true
  })

  const media = mediaGeral(respostasFiltradas)
  const cor = corMedia(media)
  const bg = bgMedia(media)
  const texto = textoMedia(media)

  // Available evaluations for this professor + materia filter
  const avaliacoesDisponiveis = avaliacoes.filter(a =>
    respostas.some(r => r.avaliacao_id === a.id && (materiaAtiva === 'todas' || r.materia === materiaAtiva))
  )

  // Evolution by evaluation
  const evolucao = avaliacoesDisponiveis
    .map(a => ({
      nome: a.nome,
      media: mediaGeral(respostas.filter(r => r.avaliacao_id === a.id && (materiaAtiva === 'todas' || r.materia === materiaAtiva))),
    }))
    .filter(e => e.media > 0)

  const dadosRadar = CRITERIOS
    .map(c => ({ label: c.label, value: mediaNotas(respostasFiltradas, c.key) }))
    .filter(d => d.value > 0)

  const comentarios = respostasFiltradas
    .map(r => r.comentario)
    .filter((c): c is string => !!c && c.trim().length > 1)

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>Carregando...</div>

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{nome}</div>
          <div style={{ fontSize: 11, color: '#999' }}>Avaliação de professor</div>
        </div>
      </div>

      {/* Matéria filter */}
      {materias.length > 1 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '8px 16px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
          <button
            onClick={() => { setMateriaAtiva('todas'); setAvaliacaoAtiva('todas') }}
            style={{ padding: '4px 12px', borderRadius: 16, fontSize: 11, border: 'none', background: materiaAtiva === 'todas' ? '#1a1a1a' : '#F1F5F9', color: materiaAtiva === 'todas' ? 'white' : '#666', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'DM Sans,sans-serif' }}
          >
            Todas
          </button>
          {materias.map(m => (
            <button
              key={m}
              onClick={() => { setMateriaAtiva(m); setAvaliacaoAtiva('todas') }}
              style={{ padding: '4px 12px', borderRadius: 16, fontSize: 11, border: 'none', background: materiaAtiva === m ? '#1a1a1a' : '#F1F5F9', color: materiaAtiva === m ? 'white' : '#666', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'DM Sans,sans-serif' }}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {/* Evaluation filter */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '8px 16px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
        <button
          onClick={() => setAvaliacaoAtiva('todas')}
          style={{ padding: '4px 12px', borderRadius: 16, fontSize: 11, border: 'none', background: avaliacaoAtiva === 'todas' ? '#2563EB' : '#F1F5F9', color: avaliacaoAtiva === 'todas' ? 'white' : '#666', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'DM Sans,sans-serif' }}
        >
          Geral
        </button>
        {avaliacoesDisponiveis.map(a => (
          <button
            key={a.id}
            onClick={() => setAvaliacaoAtiva(a.id)}
            style={{ padding: '4px 12px', borderRadius: 16, fontSize: 11, border: 'none', background: avaliacaoAtiva === a.id ? '#2563EB' : '#F1F5F9', color: avaliacaoAtiva === a.id ? 'white' : '#666', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'DM Sans,sans-serif' }}
          >
            {a.nome}
          </button>
        ))}
      </div>

      <div style={{ padding: 16 }}>
        {/* Avatar + média */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, color: '#166534', flexShrink: 0 }}>
              {nome.split(' ').map(w => w[0]).slice(0, 2).join('')}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{nome}</div>
              <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                {respostasFiltradas.length} avaliações
                {materiaAtiva !== 'todas' ? ` · ${materiaAtiva}` : materias.length === 1 ? ` · ${materias[0]}` : ''}
              </div>
              <StarRating value={media} />
            </div>
          </div>

          <div style={{ background: bg, borderRadius: 12, padding: '14px 16px', textAlign: 'center', border: `1.5px solid ${cor}30` }}>
            <div style={{ fontSize: 40, fontWeight: 800, color: cor, lineHeight: 1 }}>{media.toFixed(2)}</div>
            <div style={{ fontSize: 12, color: cor, fontWeight: 600, marginTop: 4 }}>{texto}</div>
            <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>média geral / 5,0</div>
          </div>
        </div>

        {/* Radar */}
        {dadosRadar.length >= 3 && (
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Perfil de avaliação</div>
            <RadarProfessor dados={dadosRadar} />
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
                  <span style={{ fontWeight: 700, color: co }}>{m > 0 ? m.toFixed(2) : '—'}</span>
                </div>
                <div style={{ height: 8, background: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: co, borderRadius: 4, transition: 'width 0.5s' }} />
                </div>
              </div>
            )
          })}

          {/* Ritmo — info complementar, fora da média */}
          {(() => {
            const ritmoMedia = mediaNotas(respostasFiltradas, 'ritmo_aula')
            const ritmoLabel = RITMO_LABELS[Math.round(ritmoMedia)] ?? '—'
            return ritmoMedia > 0 ? (
              <div style={{ marginTop: 6, paddingTop: 14, borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                  <span style={{ color: '#888' }}>⏱️ Ritmo da aula <span style={{ fontSize: 10, color: '#bbb' }}>(fora da média)</span></span>
                  <span style={{ fontWeight: 600, color: '#555' }}>{ritmoLabel} ({ritmoMedia.toFixed(1)})</span>
                </div>
              </div>
            ) : null
          })()}
        </div>

        {/* Evolução */}
        {evolucao.length >= 2 && (
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Evolução por avaliação</div>
            <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>Média geral ao longo do tempo</div>
            <LineChart labels={evolucao.map(e => e.nome)} dados={evolucao.map(e => e.media)} />
            {CRITERIOS.map(c => {
              const evolCrit = avaliacoesDisponiveis
                .map(a => ({
                  nome: a.nome,
                  val: mediaNotas(
                    respostas.filter(r => r.avaliacao_id === a.id && (materiaAtiva === 'todas' || r.materia === materiaAtiva)),
                    c.key
                  ),
                }))
                .filter(e => e.val > 0)
              if (evolCrit.length < 2) return null
              return (
                <div key={c.key} style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#666', marginBottom: 4 }}>{c.icon} {c.label}</div>
                  <LineChart labels={evolCrit.map(e => e.nome)} dados={evolCrit.map(e => e.val)} />
                </div>
              )
            })}
          </div>
        )}

        {/* Comentários */}
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
            Comentários dos alunos ({comentarios.length})
          </div>
          {comentarios.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#bbb', padding: 20, fontSize: 13 }}>
              Nenhum comentário nesta seleção
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {comentarios.map((c, i) => (
                <div
                  key={i}
                  style={{ background: '#F7F6F3', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#444', lineHeight: 1.5, borderLeft: '3px solid #2563EB' }}
                >
                  "{c}"
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <Nav />
    </div>
  )
}
