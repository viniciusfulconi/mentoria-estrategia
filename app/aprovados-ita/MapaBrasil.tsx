'use client'
import { useState } from 'react'

export interface EstadoInfo {
  total: number
  media2fase: number
  matematica: number
  fisica: number
  quimica: number
  portRed: number
  bancas: { banca: string; total: number }[]
}

interface Props {
  dados: Record<string, EstadoInfo>
  estadoSelecionado: string | null
  onSelecionar: (uf: string | null) => void
}

// ViewBox: 0 0 540 580
// x = (lon + 74) * 12,  y = (6 - lat) * 12
// Polígonos redesenhados para formas menos retangulares
const ESTADOS: Record<string, {
  points: string
  cx: number
  cy: number
  nome: string
  label?: string
  tiny?: boolean   // estado pequeno demais para mostrar contagem dentro
}> = {
  // ── NORTE ─────────────────────────────────────────────────────────
  RR: {
    points: '120,8 180,8 192,44 168,58 132,44',
    cx: 158, cy: 32, nome: 'Roraima',
  },
  AP: {
    points: '264,12 312,10 308,64 264,58',
    cx: 287, cy: 36, nome: 'Amapá',
  },
  AM: {
    points: '6,46 168,46 192,60 204,156 168,182 84,182 6,144',
    cx: 105, cy: 110, nome: 'Amazonas',
  },
  PA: {
    points: '192,38 276,34 318,60 336,72 336,168 204,168 192,60',
    cx: 258, cy: 105, nome: 'Pará',
  },
  AC: {
    points: '0,150 90,150 84,210 0,210',
    cx: 44, cy: 180, nome: 'Acre',
  },
  RO: {
    points: '90,168 168,168 174,228 90,228',
    cx: 130, cy: 198, nome: 'Rondônia',
  },

  // ── CENTRO-NORTE ──────────────────────────────────────────────────
  MT: {
    points: '168,168 276,168 288,204 290,288 192,290 168,240',
    cx: 224, cy: 232, nome: 'Mato Grosso',
  },
  TO: {
    points: '288,108 324,108 336,132 338,228 290,230 276,216',
    cx: 308, cy: 172, nome: 'Tocantins',
  },

  // ── NORDESTE ──────────────────────────────────────────────────────
  MA: {
    points: '312,44 360,36 390,60 396,84 396,168 336,168 314,130',
    cx: 355, cy: 107, nome: 'Maranhão',
  },
  PI: {
    points: '348,106 396,84 408,108 408,204 384,210 348,168',
    cx: 378, cy: 148, nome: 'Piauí',
  },
  CE: {
    points: '396,84 444,72 480,100 474,138 444,170 396,156',
    cx: 432, cy: 122, nome: 'Ceará',
  },
  RN: {
    points: '456,80 492,90 488,132 450,132',
    cx: 472, cy: 108, nome: 'Rio Grande do Norte', label: 'RN', tiny: true,
  },
  PB: {
    points: '444,132 488,132 476,156 432,156',
    cx: 460, cy: 144, nome: 'Paraíba', tiny: true,
  },
  PE: {
    points: '390,156 476,144 488,158 468,182 390,170',
    cx: 433, cy: 165, nome: 'Pernambuco', tiny: true,
  },
  AL: {
    points: '444,182 474,182 462,206 440,206',
    cx: 455, cy: 194, nome: 'Alagoas', tiny: true,
  },
  SE: {
    points: '436,196 458,194 448,218 434,218',
    cx: 444, cy: 206, nome: 'Sergipe', tiny: true,
  },
  BA: {
    points: '336,168 444,168 460,196 456,228 432,292 372,302 336,254',
    cx: 393, cy: 234, nome: 'Bahia',
  },

  // ── CENTRO-OESTE ──────────────────────────────────────────────────
  GO: {
    points: '252,210 338,198 350,228 348,302 276,302 252,270',
    cx: 302, cy: 254, nome: 'Goiás',
  },
  DF: {
    points: '304,248 320,246 322,260 306,260',
    cx: 313, cy: 253, nome: 'Distrito Federal', label: 'DF', tiny: true,
  },
  MS: {
    points: '168,290 290,290 294,314 278,362 250,374 174,362 168,334',
    cx: 228, cy: 330, nome: 'Mato Grosso do Sul',
  },

  // ── SUDESTE ───────────────────────────────────────────────────────
  MG: {
    points: '278,232 338,198 380,214 420,272 422,338 396,352 348,352 276,338',
    cx: 352, cy: 290, nome: 'Minas Gerais',
  },
  ES: {
    points: '408,272 432,258 446,308 430,340 408,330',
    cx: 422, cy: 300, nome: 'Espírito Santo', label: 'ES', tiny: true,
  },
  RJ: {
    points: '350,352 420,338 422,364 396,374 352,368',
    cx: 386, cy: 358, nome: 'Rio de Janeiro', label: 'RJ', tiny: true,
  },
  SP: {
    points: '228,338 348,338 352,368 348,382 290,392 228,378',
    cx: 290, cy: 362, nome: 'São Paulo',
  },

  // ── SUL ───────────────────────────────────────────────────────────
  PR: {
    points: '210,382 300,370 316,404 300,422 210,414',
    cx: 264, cy: 398, nome: 'Paraná',
  },
  SC: {
    points: '216,418 300,424 298,458 262,460 218,450',
    cx: 264, cy: 440, nome: 'Santa Catarina',
  },
  RS: {
    points: '186,448 262,444 280,484 258,524 192,528 174,492',
    cx: 224, cy: 487, nome: 'Rio Grande do Sul',
  },
}

// Thresholds de cor (relativo ao máximo do dataset filtrado)
function corEstado(total: number, max: number): string {
  if (total === 0) return '#E8ECF0'
  const pct = total / max
  if (pct >= 0.7) return '#14532d'
  if (pct >= 0.35) return '#166534'
  if (pct >= 0.15) return '#16a34a'
  if (pct >= 0.06) return '#4ade80'
  if (pct >= 0.02) return '#86efac'
  return '#dcfce7'
}

function corTexto(total: number, max: number): string {
  return total / max >= 0.15 ? 'white' : '#1a1a1a'
}

export default function MapaBrasil({ dados, estadoSelecionado, onSelecionar }: Props) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  const max = Math.max(...Object.values(dados).map(d => d.total), 1)

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg
        viewBox="0 0 540 560"
        style={{ width: '100%', maxWidth: 540, display: 'block', margin: '0 auto' }}
        onMouseMove={handleMouseMove}
      >
        {Object.entries(ESTADOS).map(([uf, est]) => {
          const info = dados[uf]
          const total = info?.total ?? 0
          const isSelected = estadoSelecionado === uf
          const isHovered = hovered === uf
          const fill = corEstado(total, max)
          const textColor = corTexto(total, max)
          const hasData = total > 0

          return (
            <g
              key={uf}
              style={{ cursor: hasData ? 'pointer' : 'default' }}
              onClick={() => hasData && onSelecionar(isSelected ? null : uf)}
              onMouseEnter={() => setHovered(uf)}
              onMouseLeave={() => setHovered(null)}
            >
              <polygon
                points={est.points}
                fill={fill}
                stroke={isSelected ? '#2563EB' : isHovered ? '#6B7280' : '#fff'}
                strokeWidth={isSelected ? 2.5 : 1}
                style={{ transition: 'fill 0.2s, opacity 0.15s' }}
                opacity={isHovered && !isSelected ? 0.85 : 1}
              />

              {/* Para estados grandes: mostra contagem grande + UF pequeno */}
              {!est.tiny && hasData && (
                <>
                  <text
                    x={est.cx} y={est.cy - 4}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={14} fontWeight="800"
                    fill={textColor} pointerEvents="none"
                    style={{ userSelect: 'none' }}
                  >
                    {total}
                  </text>
                  <text
                    x={est.cx} y={est.cy + 11}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={8} fontWeight="500"
                    fill={textColor} pointerEvents="none"
                    style={{ userSelect: 'none', opacity: 0.8 }}
                  >
                    {est.label ?? uf}
                  </text>
                </>
              )}

              {/* Estados grandes sem dados: só sigla */}
              {!est.tiny && !hasData && (
                <text
                  x={est.cx} y={est.cy + 1}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={9} fontWeight="400"
                  fill="#999" pointerEvents="none"
                  style={{ userSelect: 'none' }}
                >
                  {est.label ?? uf}
                </text>
              )}

              {/* Estados pequenos: só sigla (contagem fica no tooltip) */}
              {est.tiny && (
                <text
                  x={est.cx} y={est.cy + 1}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={hasData ? 7 : 6} fontWeight={hasData ? '700' : '400'}
                  fill={hasData ? textColor : '#aaa'} pointerEvents="none"
                  style={{ userSelect: 'none' }}
                >
                  {hasData ? `${est.label ?? uf} ${total}` : (est.label ?? uf)}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {/* Tooltip */}
      {hovered && (
        <div style={{
          position: 'absolute',
          left: Math.min(tooltipPos.x + 12, 300),
          top: Math.max(tooltipPos.y - 56, 4),
          background: 'rgba(10,10,10,0.92)',
          color: 'white',
          borderRadius: 10,
          padding: '8px 12px',
          fontSize: 13,
          fontWeight: 500,
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          zIndex: 20,
          boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
        }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{ESTADOS[hovered]?.nome}</div>
          {dados[hovered]?.total
            ? (
              <>
                <div style={{ color: '#4ade80', fontSize: 13, marginTop: 2 }}>
                  {dados[hovered].total} aprovado{dados[hovered].total > 1 ? 's' : ''}
                </div>
                <div style={{ color: '#aaa', fontSize: 11, marginTop: 1 }}>
                  Média 2ª fase: <strong style={{ color: '#fff' }}>{dados[hovered].media2fase.toFixed(3)}</strong>
                </div>
              </>
            )
            : <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>Nenhum aprovado</div>
          }
        </div>
      )}

      {/* Legenda */}
      <div style={{
        display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center',
        marginTop: 10, flexWrap: 'wrap',
      }}>
        {[
          { cor: '#E8ECF0', label: '0' },
          { cor: '#dcfce7', label: '1–3' },
          { cor: '#86efac', label: '4–10' },
          { cor: '#4ade80', label: '11–30' },
          { cor: '#16a34a', label: '31–80' },
          { cor: '#14532d', label: '80+' },
        ].map(({ cor, label }) => (
          <div key={cor} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 13, height: 13, borderRadius: 3, background: cor, border: '0.5px solid rgba(0,0,0,0.12)' }} />
            <span style={{ fontSize: 11, color: '#555' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
