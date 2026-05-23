'use client'
import { useState } from 'react'
import { CORES_MATERIA } from '@/lib/cores'

const CORES_MAT: Record<string, string> = {
  ...CORES_MATERIA,
  'Português/Redação': '#FB8C00',
  'Port./Red.': '#FB8C00',
}

export function BarChart({ dados }: { dados: { materia: string, pct: number }[] }) {
  if (!dados.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {dados.map(({ materia, pct }) => {
        const cor = CORES_MAT[materia] || '#2563EB'
        return (
          <div key={materia}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
              <span style={{ color: '#666' }}>{materia}</span>
              <span style={{ fontWeight: 600, color: cor }}>{pct}%</span>
            </div>
            <div style={{ height: 8, background: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: cor, borderRadius: 4, transition: 'width 0.5s' }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function GraficoQuestoes({ dados, turmaQuestoes, cicloAtivo, fase, titulo, corAluno }: any) {
  const cicloNum = String(cicloAtivo || '').match(/\d+/)?.[0] || ''
  if (!cicloNum) return null

  const regAluno = dados.find((r: any) => {
    const cn = String(r.ciclo_nome || '')
    const num = cn.match(/\d+/)?.[0] || ''
    return num === cicloNum && r.fase === fase
  })
  if (!regAluno?.notas_questoes) return null

  const questoesAluno = regAluno.notas_questoes as Record<string, number>
  const questoes = Object.keys(questoesAluno).sort((a, b) => {
    const na = parseInt(a.replace('Q', ''))
    const nb = parseInt(b.replace('Q', ''))
    return na - nb
  })

  if (!questoes.length) return null

  const registrosTurma = turmaQuestoes.filter((r: any) => {
    const cn = String(r.ciclo_nome || '')
    const num = cn.match(/\d+/)?.[0] || ''
    return num === cicloNum && r.fase === fase && r.notas_questoes
  })

  const mediaTurma: Record<string, number> = {}
  questoes.forEach(q => {
    const vals = registrosTurma
      .map((r: any) => r.notas_questoes?.[q])
      .filter((v: any) => v !== null && v !== undefined)
    mediaTurma[q] = vals.length ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : 0
  })

  const barW = Math.max(8, Math.min(20, Math.floor(320 / questoes.length)))
  const gap = 2
  const totalW = questoes.length * (barW * 2 + gap + 4)
  const h = 100
  const padT = 16
  const padB = 20

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>{titulo}</div>
      <div style={{ display: 'flex', gap: 12, fontSize: 10, color: '#666', marginBottom: 6 }}>
        <span style={{ color: corAluno, fontWeight: 600 }}><span style={{ display: 'inline-block', width: 10, height: 10, background: corAluno, borderRadius: 2, marginRight: 4 }} />Aluno</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#D0D0D0', borderRadius: 2, marginRight: 4 }} />Turma</span>
      </div>
      <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
        <svg viewBox={`0 0 ${Math.max(totalW, 300)} ${padT + h + padB}`} width={Math.max(totalW, 300)} height={padT + h + padB} style={{ display: 'block' }}>
          {[0.25, 0.5, 0.75, 1.0].map(v => (
            <g key={v}>
              <line x1="0" y1={padT + h - v * h} x2={Math.max(totalW, 300)} y2={padT + h - v * h} stroke="rgba(0,0,0,0.06)" strokeWidth="1" />
              <text x="2" y={padT + h - v * h - 2} fontSize="7" fill="#bbb">{(v * 100).toFixed(0)}%</text>
            </g>
          ))}

          {questoes.map((q, i) => {
            const vAluno = questoesAluno[q] ?? 0
            const vTurma = mediaTurma[q] ?? 0
            const x = i * (barW * 2 + gap + 4) + 2
            const hAluno = vAluno * h
            const hTurma = vTurma * h
            const corBarra = corAluno || '#2563EB'
            const pctTurma = Math.round(vTurma * 100)

            return (
              <g key={q}>
                {registrosTurma.length > 0 && (
                  <rect x={x} y={h - Math.max(hTurma, 1)} width={barW} height={Math.max(hTurma, 1)} fill="#D0D0D0" rx="2" />
                )}
                {registrosTurma.length > 0 && pctTurma > 0 ? (
                  <text x={x + barW/2} y={h - hTurma - 2} textAnchor="middle" fontSize="7" fill="#999">{pctTurma}%</text>
                ) : null}
                <rect x={registrosTurma.length > 0 ? x + barW + gap : x + barW/2} y={h - Math.max(hAluno, 1)} width={barW} height={Math.max(hAluno, 1)} fill={corBarra} rx="2" />
                <text x={registrosTurma.length > 0 ? x + barW + gap + barW/2 : x + barW} y={h - hAluno - 2} textAnchor="middle" fontSize="7" fill={corBarra}>{Math.round(vAluno * 100)}%</text>
                <text x={x + barW} y={h + padB - 4} textAnchor="middle" fontSize="7" fill="#999">
                  {q.replace('Q', '')}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

export function RadarQuestoesChart({ dados, turmaQuestoes, cicloAtivo, fase, titulo, corAluno }: any) {
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const cicloNum = String(cicloAtivo || '').match(/\d+/)?.[0] || ''
  if (!cicloNum) return null

  const regAluno = dados.find((r: any) => {
    const num = String(r.ciclo_nome || '').match(/\d+/)?.[0] || ''
    return num === cicloNum && r.fase === fase
  })
  if (!regAluno?.notas_questoes) return null

  const questoesAluno = regAluno.notas_questoes as Record<string, number>
  const questoes = Object.keys(questoesAluno).sort((a, b) => {
    return parseInt(a.replace(/\D/g, '')) - parseInt(b.replace(/\D/g, ''))
  })
  if (!questoes.length) return null

  const registrosTurma = turmaQuestoes.filter((r: any) => {
    const num = String(r.ciclo_nome || '').match(/\d+/)?.[0] || ''
    return num === cicloNum && r.fase === fase && r.notas_questoes
  })

  const mediaTurma: Record<string, number> = {}
  const top25Turma: Record<string, number> = {}

  questoes.forEach(q => {
    const vals = registrosTurma
      .map((r: any) => r.notas_questoes?.[q])
      .filter((v: any) => v !== null && v !== undefined)
      .map(Number)
      .sort((a: number, b: number) => b - a)

    mediaTurma[q] = vals.length ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : 0

    if (vals.length > 0) {
      const top25Count = Math.max(1, Math.ceil(vals.length * 0.25))
      const top25Vals = vals.slice(0, top25Count)
      top25Turma[q] = top25Vals.reduce((a: number, b: number) => a + b, 0) / top25Vals.length
    } else {
      top25Turma[q] = 0
    }
  })

  const n = questoes.length
  const cx = 160, cy = 155, raio = 110
  const niveis = [0.25, 0.5, 0.75, 1.0]
  const hasData = registrosTurma.length > 0

  function pontoEixo(idx: number, r: number): [number, number] {
    const angulo = (Math.PI * 2 * idx) / n - Math.PI / 2
    return [cx + r * Math.cos(angulo), cy + r * Math.sin(angulo)]
  }

  function polyPath(vals: Record<string, number>) {
    return questoes.map((q, i) => {
      const [x, y] = pontoEixo(i, (Math.min(vals[q] ?? 0, 1)) * raio)
      return `${x},${y}`
    }).join(' ')
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{titulo}</div>
      <div style={{ display: 'flex', gap: 14, fontSize: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 14, height: 3, background: corAluno, borderRadius: 2, display: 'inline-block' }} />
          <span style={{ color: corAluno, fontWeight: 600 }}>Aluno</span>
        </span>
        {hasData && (
          <>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 14, height: 3, background: '#B0B0B0', borderRadius: 2, display: 'inline-block' }} />
              <span style={{ color: '#888' }}>Média turma</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 14, height: 3, background: '#16A34A', borderRadius: 2, display: 'inline-block', borderTop: '1px dashed #16A34A' }} />
              <span style={{ color: '#16A34A' }}>Top 25%</span>
            </span>
          </>
        )}
      </div>
      <svg viewBox="0 0 320 310" width="100%" style={{ maxWidth: 320, display: 'block', margin: '0 auto' }}>
        {niveis.map(nivel => {
          const ps = questoes.map((_, i) => pontoEixo(i, nivel * raio))
          const path = ps.map(([x, y], j) => `${j === 0 ? 'M' : 'L'}${x},${y}`).join(' ') + 'Z'
          return (
            <g key={nivel}>
              <path d={path} fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth="1" />
              <text x={cx + 3} y={cy - nivel * raio + 3} fontSize="7" fill="#ccc">{(nivel * 100).toFixed(0)}%</text>
            </g>
          )
        })}
        {questoes.map((_, i) => {
          const [x, y] = pontoEixo(i, raio)
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(0,0,0,0.07)" strokeWidth="1" />
        })}
        {hasData && (
          <polygon points={polyPath(top25Turma)} fill="#16A34A" fillOpacity="0.08" stroke="#16A34A" strokeWidth="1.5" strokeDasharray="5,3" />
        )}
        {hasData && (
          <polygon points={polyPath(mediaTurma)} fill="#B0B0B0" fillOpacity="0.12" stroke="#B0B0B0" strokeWidth="1.5" />
        )}
        <polygon points={polyPath(questoesAluno)} fill={corAluno} fillOpacity="0.18" stroke={corAluno} strokeWidth="2" />
        {questoes.map((q, i) => {
          const [x, y] = pontoEixo(i, raio + 17)
          const ativo = selecionada === q
          return (
            <text
              key={i} x={x} y={y} textAnchor="middle"
              fontSize={ativo ? '10' : '9'} fontWeight={ativo ? '700' : '600'}
              fill={ativo ? corAluno : '#666'} dominantBaseline="middle"
              style={{ cursor: 'pointer', userSelect: 'none' }}
              onClick={() => setSelecionada(ativo ? null : q)}
            >
              {q}
            </text>
          )
        })}
        {questoes.map((q, i) => {
          const v = Math.min(questoesAluno[q] ?? 0, 1)
          const [x, y] = pontoEixo(i, v * raio)
          const ativo = selecionada === q
          return (
            <circle
              key={i} cx={x} cy={y} r={ativo ? 6 : 4}
              fill={corAluno} stroke="white" strokeWidth={ativo ? 2 : 1.5}
              style={{ cursor: 'pointer' }}
              onClick={() => setSelecionada(ativo ? null : q)}
            />
          )
        })}
      </svg>

      {selecionada && (
        <div style={{
          marginTop: 10, background: 'white',
          border: `1.5px solid ${corAluno}`, borderRadius: 12,
          padding: '12px 14px', boxShadow: 'var(--shadow-md)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: corAluno }}>{selecionada}</span>
            <button
              onClick={() => setSelecionada(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', fontSize: 15, lineHeight: 1, padding: 2 }}
            >✕</button>
          </div>
          {[
            { label: 'Aluno', val: Math.round((questoesAluno[selecionada] ?? 0) * 100), cor: corAluno, show: true },
            { label: 'Média da turma', val: Math.round((mediaTurma[selecionada] ?? 0) * 100), cor: '#999', show: hasData },
            { label: 'Top 25%', val: Math.round((top25Turma[selecionada] ?? 0) * 100), cor: '#16A34A', show: hasData },
          ].filter(r => r.show).map(({ label, val, cor }) => (
            <div key={label} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                <span style={{ color: '#666' }}>{label}</span>
                <span style={{ fontWeight: 700, color: cor }}>{val}%</span>
              </div>
              <div style={{ height: 5, background: '#F1F5F9', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${val}%`, background: cor, borderRadius: 3 }} />
              </div>
            </div>
          ))}
          <div style={{ fontSize: 10, color: '#bbb', marginTop: 6, textAlign: 'center' }}>
            Toque em outra questão ou em ✕ para fechar
          </div>
        </div>
      )}
    </div>
  )
}

export function GraficoEvolucaoLinhas({ rankings }: { rankings: any[] }) {
  const [cicloSel, setCicloSel] = useState<number | null>(null)

  const series = [
    { label: '1ª Fase',    campo: 'media_1fase',      cor: '#64748B' },
    { label: 'Matemática', campo: 'nota_matematica',   cor: '#2563EB' },
    { label: 'Física',     campo: 'nota_fisica',       cor: '#1E88E5' },
    { label: 'Química',    campo: 'nota_quimica',      cor: '#E53935' },
    { label: 'Port./Red.', campo: 'media_linguagens',  cor: '#FB8C00' },
  ].filter(s => rankings.some(r => r[s.campo] != null && Number(r[s.campo]) > 0))

  if (!series.length) return null

  const w = 320, h = 170, pL = 24, pR = 12, pT = 12, pB = 22
  const plotW = w - pL - pR
  const plotH = h - pT - pB

  const xAt = (i: number) =>
    pL + (rankings.length === 1 ? plotW / 2 : (i / (rankings.length - 1)) * plotW)
  const yAt = (v: number) => pT + (1 - v / 10) * plotH

  const colHW = rankings.length > 1 ? (plotW / (rankings.length - 1)) / 2 : plotW / 2

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: 'block' }}>
        {[2, 4, 5, 6, 8, 10].map(v => (
          <g key={v}>
            <line x1={pL} x2={w - pR} y1={yAt(v)} y2={yAt(v)}
              stroke={v === 4 || v === 5 ? 'rgba(220,38,38,0.25)' : 'rgba(0,0,0,0.06)'}
              strokeWidth={v === 4 || v === 5 ? 1.5 : 1}
              strokeDasharray={v === 4 || v === 5 ? '5,3' : undefined}
            />
            <text x={pL - 3} y={yAt(v) + 3.5} textAnchor="end" fontSize="7"
              fill={v === 4 || v === 5 ? 'rgba(220,38,38,0.55)' : '#ccc'}>{v}</text>
          </g>
        ))}

        {series.map(s => {
          let d = '', lastValid = false
          rankings.forEach((r, i) => {
            const v = Number(r[s.campo])
            if (!r[s.campo] || v <= 0) { lastValid = false; return }
            d += `${lastValid ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`
            lastValid = true
          })
          return (
            <path key={s.campo} d={d} fill="none" stroke={s.cor} strokeWidth="2"
              strokeLinejoin="round" strokeLinecap="round"
              opacity={cicloSel !== null ? 0.35 : 1} />
          )
        })}

        {cicloSel !== null && (
          <line
            x1={xAt(cicloSel)} x2={xAt(cicloSel)} y1={pT} y2={pT + plotH}
            stroke="rgba(0,0,0,0.18)" strokeWidth="1.5" strokeDasharray="3,2"
          />
        )}

        {series.map(s =>
          rankings.map((r, i) => {
            const v = Number(r[s.campo])
            if (!r[s.campo] || v <= 0) return null
            const ativo = cicloSel === i
            return (
              <circle key={`${s.campo}-${i}`}
                cx={xAt(i)} cy={yAt(v)}
                r={ativo ? 5 : 3}
                fill={s.cor} stroke="white" strokeWidth={ativo ? 2 : 1.5}
                opacity={cicloSel !== null && !ativo ? 0.25 : 1}
              />
            )
          })
        )}

        {rankings.map((_, i) => (
          <rect key={i}
            x={xAt(i) - colHW} y={pT} width={colHW * 2} height={plotH}
            fill="transparent" style={{ cursor: 'pointer' }}
            onClick={() => setCicloSel(i === cicloSel ? null : i)}
          />
        ))}

        {rankings.map((r, i) => (
          <text key={i} x={xAt(i)} y={h - 4} textAnchor="middle" fontSize="8"
            fontWeight={cicloSel === i ? '700' : '400'}
            fill={cicloSel === i ? '#1a1a1a' : '#999'}>
            {String(r.ciclo_nome).replace('Ciclo ', 'C').replace(/ - ITA| - IME/g, '')}
          </text>
        ))}
      </svg>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 12px', fontSize: 10, marginTop: 6 }}>
        {series.map(s => (
          <span key={s.campo} style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#888' }}>
            <span style={{ width: 12, height: 2.5, background: s.cor, borderRadius: 2, display: 'inline-block', flexShrink: 0 }} />
            {s.label}
          </span>
        ))}
      </div>

      {cicloSel !== null ? (
        <div style={{ marginTop: 10, background: '#F8FAFC', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#1a1a1a' }}>
              {String(rankings[cicloSel].ciclo_nome).replace(/ - ITA| - IME/g, '')}
            </span>
            <button onClick={() => setCicloSel(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', fontSize: 14, lineHeight: 1, padding: 2 }}>
              ✕
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
            {series.map(s => {
              const v = Number(rankings[cicloSel][s.campo])
              if (!rankings[cicloSel][s.campo] || v <= 0) return null
              const cor = v >= 7 ? '#16A34A' : v >= 5 ? '#D97706' : '#DC2626'
              return (
                <div key={s.campo} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#666' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.cor, display: 'inline-block', flexShrink: 0 }} />
                    {s.label}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: cor }}>{v.toFixed(1)}</span>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 10, color: '#bbb', marginTop: 8, textAlign: 'center' }}>
          Toque num ciclo para ver as notas
        </div>
      )}
    </div>
  )
}

export function RadarSection({ rankings }: { rankings: any[] }) {
  const [modo, setModo] = useState<'media' | 'recente'>('media')

  const campos = [
    { label: 'Matemática', campo: 'nota_matematica' },
    { label: 'Física', campo: 'nota_fisica' },
    { label: 'Química', campo: 'nota_quimica' },
    { label: 'Port./Red.', campo: 'media_linguagens' },
  ]

  const dadosMedia = campos.map(({ label, campo }) => {
    const vals = rankings.map(r => Number(r[campo])).filter(v => v > 0)
    return { materia: label, nota: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0 }
  }).filter(d => d.nota > 0)

  const ultimoRanking = rankings[rankings.length - 1]
  const dadosRecente = campos.map(({ label, campo }) => ({
    materia: label, nota: Number(ultimoRanking?.[campo] || 0)
  })).filter(d => d.nota > 0)

  const dadosRadar = modo === 'media' ? dadosMedia : dadosRecente
  const n = dadosRadar.length
  const cx = 150, cy = 150, raio = 100
  const max = 10
  const niveis = [2, 4, 6, 8, 10]

  function pontoEixo(idx: number, r: number): [number, number] {
    const angulo = (Math.PI * 2 * idx) / n - Math.PI / 2
    return [cx + r * Math.cos(angulo), cy + r * Math.sin(angulo)]
  }

  const pontos = dadosRadar.map((d, i) => pontoEixo(i, (d.nota / max) * raio))
  const polyPath = pontos.map(([x, y]) => `${x},${y}`).join(' ')

  if (!dadosRadar.length) return null

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Perfil por matéria</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['media', 'recente'] as const).map(m => (
            <button key={m} onClick={() => setModo(m)} style={{
              padding: '3px 10px', borderRadius: 12, fontSize: 10, border: 'none',
              background: modo === m ? '#2563EB' : '#F1F5F9',
              color: modo === m ? 'white' : '#666',
              cursor: 'pointer', fontFamily: 'DM Sans,sans-serif'
            }}>{m === 'media' ? 'Média geral' : 'Último ciclo'}</button>
          ))}
        </div>
      </div>
      <svg viewBox="0 0 300 300" width="100%" style={{ maxWidth: 300, margin: '0 auto', display: 'block' }}>
        {niveis.map(nivel => {
          const ps = dadosRadar.map((_, i) => pontoEixo(i, (nivel / max) * raio))
          const path = ps.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ') + 'Z'
          return <path key={nivel} d={path} fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth="1" />
        })}
        {dadosRadar.map((_, i) => {
          const [x, y] = pontoEixo(i, raio)
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(0,0,0,0.07)" strokeWidth="1" />
        })}
        <polygon points={polyPath} fill="#2563EB" fillOpacity="0.15" stroke="#2563EB" strokeWidth="2" />
        {pontos.map(([x, y], i) => {
          const cor = CORES_MAT[dadosRadar[i].materia] || '#2563EB'
          return (
            <g key={i}>
              <circle cx={x} cy={y} r="5" fill={cor} stroke="white" strokeWidth="1.5" />
              <text x={x} y={y - 9} textAnchor="middle" fontSize="9" fontWeight="700" fill={cor}>
                {dadosRadar[i].nota.toFixed(1)}
              </text>
            </g>
          )
        })}
        {dadosRadar.map((d, i) => {
          const [x, y] = pontoEixo(i, raio + 20)
          const cor = CORES_MAT[d.materia] || '#2563EB'
          return (
            <text key={i} x={x} y={y} textAnchor="middle" fontSize="10" fontWeight="600" fill={cor} dominantBaseline="middle">
              {d.materia}
            </text>
          )
        })}
        {niveis.map(nivel => (
          <text key={nivel} x={cx + 3} y={cy - (nivel / max) * raio + 3} fontSize="7" fill="#ccc">{nivel}</text>
        ))}
      </svg>
    </div>
  )
}
