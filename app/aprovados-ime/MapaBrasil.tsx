'use client'
import { useState } from 'react'
import { ComposableMap, Geographies, Geography } from 'react-simple-maps'

export interface EstadoInfoIME {
  total: number
  media: number
  matematica: number
  fisica: number
  quimica: number
  portugues: number
  ingles: number
  cidades: { cidade: string; total: number }[]
}

interface Props {
  dados: Record<string, EstadoInfoIME>
  estadoSelecionado: string | null
  onSelecionar: (uf: string | null) => void
}

const GEO_URL = '/geo/brasil-estados.json'

function corEstado(total: number, max: number): string {
  if (total === 0) return '#E8ECF0'
  const pct = total / max
  if (pct >= 0.7) return '#1e3a5f'
  if (pct >= 0.35) return '#1e40af'
  if (pct >= 0.15) return '#f97316'
  if (pct >= 0.06) return '#60a5fa'
  if (pct >= 0.02) return '#bfdbfe'
  return '#dbeafe'
}

export default function MapaBrasilIME({ dados, estadoSelecionado, onSelecionar }: Props) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  const max = Math.max(...Object.values(dados).map(d => d.total), 1)

  return (
    <div
      style={{ position: 'relative', width: '100%' }}
      onMouseMove={e => {
        const rect = e.currentTarget.getBoundingClientRect()
        setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
      }}
    >
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ center: [-54, -15], scale: 680 }}
        style={{ width: '100%', height: 'auto' }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map(geo => {
              const uf = geo.properties.UF as string
              const info = dados[uf]
              const total = info?.total ?? 0
              const isSelected = estadoSelecionado === uf
              const fill = corEstado(total, max)
              const hasData = total > 0

              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={fill}
                  stroke={isSelected ? '#f59e0b' : '#fff'}
                  strokeWidth={isSelected ? 1.5 : 0.5}
                  style={{
                    default: { outline: 'none', opacity: 1 },
                    hover: { outline: 'none', opacity: 0.82, fill: hasData ? fill : '#d4d8dd', cursor: hasData ? 'pointer' : 'default' },
                    pressed: { outline: 'none' },
                  }}
                  onMouseEnter={() => setHovered(uf)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => hasData && onSelecionar(isSelected ? null : uf)}
                />
              )
            })
          }
        </Geographies>
      </ComposableMap>

      {/* Tooltip */}
      {hovered && (
        <div style={{
          position: 'absolute',
          left: Math.min(tooltipPos.x + 14, 280),
          top: Math.max(tooltipPos.y - 60, 4),
          background: 'rgba(10,10,10,0.92)', color: 'white',
          borderRadius: 10, padding: '8px 12px',
          fontSize: 13, fontWeight: 500, pointerEvents: 'none',
          whiteSpace: 'nowrap', zIndex: 20,
          boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
        }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{hovered}</div>
          {dados[hovered]?.total
            ? (
              <>
                <div style={{ color: '#60a5fa', fontSize: 13, marginTop: 2 }}>
                  {dados[hovered].total} aprovado{dados[hovered].total > 1 ? 's' : ''}
                </div>
                <div style={{ color: '#aaa', fontSize: 11, marginTop: 1 }}>
                  Média: <strong style={{ color: '#fff' }}>{dados[hovered].media.toFixed(3)}</strong>
                </div>
              </>
            )
            : <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>Nenhum aprovado</div>
          }
        </div>
      )}

      {/* Legenda */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 10, flexWrap: 'wrap' }}>
        {[
          { cor: '#E8ECF0', label: '0' },
          { cor: '#dbeafe', label: '1–5' },
          { cor: '#bfdbfe', label: '6–15' },
          { cor: '#60a5fa', label: '16–40' },
          { cor: '#1e40af', label: '41+' },
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
