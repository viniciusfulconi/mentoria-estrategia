'use client'
import { useState, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import Nav from '@/components/Nav'
import MapaBrasil, { EstadoInfo } from './MapaBrasil'
import { APROVADOS_ITA, AprovadoITA } from '@/lib/data/aprovadosITA'
import { MapPin, Users, Trophy, TrendingUp, ChevronDown, ChevronUp, Search, X } from 'lucide-react'

const MATERIAS = [
  { key: 'matematica' as const, label: 'Matemática', cor: '#3B82F6' },
  { key: 'fisica' as const, label: 'Física', cor: '#8B5CF6' },
  { key: 'quimica' as const, label: 'Química', cor: '#10B981' },
  { key: 'portRed' as const, label: 'Port./Red.', cor: '#F59E0B' },
]

function avg(arr: number[]) {
  if (!arr.length) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function buildEstadoDados(lista: AprovadoITA[]): Record<string, EstadoInfo> {
  const map: Record<string, { itens: AprovadoITA[]; bancas: Record<string, number> }> = {}
  lista.forEach(a => {
    if (!map[a.estado]) map[a.estado] = { itens: [], bancas: {} }
    map[a.estado].itens.push(a)
    map[a.estado].bancas[a.banca] = (map[a.estado].bancas[a.banca] || 0) + 1
  })
  const result: Record<string, EstadoInfo> = {}
  Object.entries(map).forEach(([uf, { itens, bancas }]) => {
    result[uf] = {
      total: itens.length,
      media2fase: avg(itens.map(a => a.media2fase)),
      matematica: avg(itens.map(a => a.matematica)),
      fisica: avg(itens.map(a => a.fisica)),
      quimica: avg(itens.map(a => a.quimica)),
      portRed: avg(itens.map(a => a.portRed)),
      bancas: Object.entries(bancas)
        .map(([banca, total]) => ({ banca, total }))
        .sort((a, b) => b.total - a.total),
    }
  })
  return result
}

function BarraMateria({ label, value, max, cor }: { label: string; value: number; max: number; cor: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 12, color: '#555', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#222' }}>{value.toFixed(3)}</span>
      </div>
      <div style={{ background: '#F0F0F0', borderRadius: 6, height: 8, overflow: 'hidden' }}>
        <div style={{
          width: `${(value / max) * 100}%`,
          height: '100%',
          background: cor,
          borderRadius: 6,
          transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  )
}

function CardStat({ label, value, sub, cor }: { label: string; value: string | number; sub?: string; cor?: string }) {
  return (
    <div style={{
      background: 'white', borderRadius: 14, padding: '16px 18px',
      border: '0.5px solid rgba(0,0,0,0.08)',
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      flex: 1, minWidth: 100,
    }}>
      <div style={{ fontSize: 11, color: '#888', fontWeight: 500, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: cor || '#1a1a1a', lineHeight: 1.2 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: '#999', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

export default function AprovadosITA() {
  const { perfil, loading: authLoading } = useAuth()
  const router = useRouter()

  const [anoFiltro, setAnoFiltro] = useState<number | null>(null)
  const [modalidadeFiltro, setModalidadeFiltro] = useState<string | null>(null)
  const [estadoSelecionado, setEstadoSelecionado] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [ordenacao, setOrdenacao] = useState<keyof AprovadoITA>('media2fase')
  const [ordemDesc, setOrdemDesc] = useState(true)
  const [tabelaAberta, setTabelaAberta] = useState(false)

  useEffect(() => {
    if (!authLoading && perfil && perfil.papel !== 'coordenador' && perfil.papel !== 'direcao') {
      router.replace('/')
    }
  }, [authLoading, perfil])

  const filtrados = useMemo(() => {
    let lista = APROVADOS_ITA
    if (anoFiltro) lista = lista.filter(a => a.ano === anoFiltro)
    if (modalidadeFiltro) lista = lista.filter(a => a.modalidade === modalidadeFiltro)
    if (estadoSelecionado) lista = lista.filter(a => a.estado === estadoSelecionado)
    if (busca) lista = lista.filter(a => a.nome.toLowerCase().includes(busca.toLowerCase()) || a.banca.toLowerCase().includes(busca.toLowerCase()))
    return lista
  }, [anoFiltro, modalidadeFiltro, estadoSelecionado, busca])

  const estadoDados = useMemo(() => buildEstadoDados(filtrados), [filtrados])
  const infoEstado = estadoSelecionado ? estadoDados[estadoSelecionado] : null

  const tabelaOrdenada = useMemo(() => {
    return [...filtrados].sort((a, b) => {
      const va = a[ordenacao] as number
      const vb = b[ordenacao] as number
      return ordemDesc ? vb - va : va - vb
    })
  }, [filtrados, ordenacao, ordemDesc])

  // Stats globais (sem filtro de estado)
  const base = useMemo(() => {
    let lista = APROVADOS_ITA
    if (anoFiltro) lista = lista.filter(a => a.ano === anoFiltro)
    if (modalidadeFiltro) lista = lista.filter(a => a.modalidade === modalidadeFiltro)
    return lista
  }, [anoFiltro, modalidadeFiltro])

  const mediaGeral = avg(base.map(a => a.media2fase))
  const mediasMaterias = MATERIAS.map(m => ({ ...m, value: avg(base.map(a => a[m.key])) }))
  const maxMateria = Math.max(...mediasMaterias.map(m => m.value))

  // Comparativo 2024 vs 2025
  const comp2024ac = APROVADOS_ITA.filter(a => a.ano === 2024 && a.modalidade === 'Ampla Concorrencia')
  const comp2025ac = APROVADOS_ITA.filter(a => a.ano === 2025 && a.modalidade === 'Ampla Concorrencia')
  const comp2024co = APROVADOS_ITA.filter(a => a.ano === 2024 && a.modalidade === 'Cota Racial')
  const comp2025co = APROVADOS_ITA.filter(a => a.ano === 2025 && a.modalidade === 'Cota Racial')

  // Correlação 1ª x 2ª fase
  const corrData = APROVADOS_ITA.filter(a => a.media1fase && a.media2fase)
  const n = corrData.length
  const m1 = avg(corrData.map(a => a.media1fase))
  const m2 = avg(corrData.map(a => a.media2fase))
  const cov = corrData.reduce((s, a) => s + (a.media1fase - m1) * (a.media2fase - m2), 0) / n
  const std1 = Math.sqrt(corrData.reduce((s, a) => s + (a.media1fase - m1) ** 2, 0) / n)
  const std2 = Math.sqrt(corrData.reduce((s, a) => s + (a.media2fase - m2) ** 2, 0) / n)
  const correlacao = cov / (std1 * std2)

  // Ranking de estados por qualidade
  const rankingEstados = Object.entries(buildEstadoDados(APROVADOS_ITA))
    .filter(([, d]) => d.total >= 2)
    .sort((a, b) => b[1].media2fase - a[1].media2fase)

  function toggleOrdem(col: keyof AprovadoITA) {
    if (ordenacao === col) setOrdemDesc(v => !v)
    else { setOrdenacao(col); setOrdemDesc(true) }
  }

  function OrdIcon({ col }: { col: keyof AprovadoITA }) {
    if (ordenacao !== col) return <span style={{ color: '#ccc', fontSize: 10 }}>↕</span>
    return ordemDesc
      ? <ChevronDown size={12} color="#f97316" />
      : <ChevronUp size={12} color="#f97316" />
  }

  if (authLoading) return null

  return (
    <div style={{ paddingBottom: 80 }}>
      <Nav />

      {/* Header */}
      <div style={{
        background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)',
        padding: '16px 20px', position: 'sticky', top: 0, zIndex: 10,
        display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Aprovados no ITA</div>
          <div style={{ fontSize: 11, color: '#999', marginTop: 1 }}>
            {base.length} aprovados · Vestibulares 2024–2025
          </div>
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[2024, 2025].map(ano => (
            <button key={ano} onClick={() => setAnoFiltro(anoFiltro === ano ? null : ano)} style={{
              fontSize: 12, fontWeight: 500, padding: '5px 12px', borderRadius: 20,
              border: '1px solid', cursor: 'pointer',
              background: anoFiltro === ano ? '#1e40af' : 'transparent',
              borderColor: anoFiltro === ano ? '#1e40af' : 'rgba(0,0,0,0.15)',
              color: anoFiltro === ano ? 'white' : '#444',
            }}>{ano}</button>
          ))}
          {['Ampla Concorrencia', 'Cota Racial'].map(m => (
            <button key={m} onClick={() => setModalidadeFiltro(modalidadeFiltro === m ? null : m)} style={{
              fontSize: 12, fontWeight: 500, padding: '5px 12px', borderRadius: 20,
              border: '1px solid', cursor: 'pointer',
              background: modalidadeFiltro === m ? '#f97316' : 'transparent',
              borderColor: modalidadeFiltro === m ? '#f97316' : 'rgba(0,0,0,0.15)',
              color: modalidadeFiltro === m ? 'white' : '#444',
            }}>{m}</button>
          ))}
          {(anoFiltro || modalidadeFiltro || estadoSelecionado) && (
            <button onClick={() => { setAnoFiltro(null); setModalidadeFiltro(null); setEstadoSelecionado(null) }} style={{
              fontSize: 12, padding: '5px 10px', borderRadius: 20,
              border: '1px solid #f87171', cursor: 'pointer',
              background: 'transparent', color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <X size={12} /> Limpar
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: '20px 16px', maxWidth: 1100, margin: '0 auto' }}>

        {/* Cards de resumo */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
          <CardStat label="Total aprovados" value={base.length} sub="2024 + 2025" cor="#166534" />
          <CardStat label="Estados" value={Object.keys(buildEstadoDados(base)).length} sub="com aprovados" />
          <CardStat label="Bancas" value={new Set(base.map(a => a.banca)).size} sub="cidades" />
          <CardStat label="Média 2ª fase" value={mediaGeral.toFixed(3)} sub="todos os filtros" cor="#1e40af" />
          <CardStat
            label="Corte (referência)"
            value={anoFiltro === 2024 ? '7,1805' : anoFiltro === 2025 ? '7,2983' : '~7,24'}
            sub={modalidadeFiltro === 'Cota Racial' ? 'cota racial' : 'ampla conc.'}
            cor="#b45309"
          />
        </div>

        {/* Layout mapa + painel */}
        <div style={{ display: 'grid', gridTemplateColumns: estadoSelecionado ? '1fr 1fr' : '1fr 380px', gap: 20, marginBottom: 24, alignItems: 'start' }}>

          {/* Mapa */}
          <div style={{ background: 'white', borderRadius: 16, padding: '20px 16px', border: '0.5px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
              Distribuição geográfica
              {estadoSelecionado && (
                <button onClick={() => setEstadoSelecionado(null)} style={{
                  marginLeft: 10, fontSize: 11, color: '#888', background: 'none',
                  border: 'none', cursor: 'pointer', padding: 0,
                }}>
                  ver todos
                </button>
              )}
            </div>
            <div style={{ fontSize: 11, color: '#999', marginBottom: 16 }}>
              Clique num estado para ver o detalhe
            </div>
            <MapaBrasil
              dados={estadoDados}
              estadoSelecionado={estadoSelecionado}
              onSelecionar={setEstadoSelecionado}
            />
          </div>

          {/* Painel direito: detalhe do estado OU médias gerais */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {estadoSelecionado && infoEstado ? (
              /* ── Detalhe do estado ── */
              <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '0.5px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{estadoSelecionado}</div>
                    <div style={{ fontSize: 12, color: '#888' }}>{infoEstado.total} aprovado{infoEstado.total > 1 ? 's' : ''}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: '#888' }}>Média 2ª fase</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#166534' }}>{infoEstado.media2fase.toFixed(3)}</div>
                  </div>
                </div>

                {/* Bancas */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                    <MapPin size={10} style={{ marginRight: 4 }} />Bancas
                  </div>
                  {infoEstado.bancas.map(b => (
                    <div key={b.banca} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '0.5px solid #F0F0F0' }}>
                      <span style={{ fontSize: 13, color: '#444', textTransform: 'capitalize', fontWeight: 500 }}>
                        {b.banca.charAt(0) + b.banca.slice(1).toLowerCase()}
                      </span>
                      <span style={{
                        fontSize: 12, fontWeight: 700, color: '#166534',
                        background: '#f0fdf4', borderRadius: 12, padding: '2px 8px',
                      }}>{b.total}</span>
                    </div>
                  ))}
                </div>

                {/* Médias por matéria */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                    Médias por matéria
                  </div>
                  {MATERIAS.map(m => (
                    <BarraMateria
                      key={m.key}
                      label={m.label}
                      value={infoEstado[m.key]}
                      max={10}
                      cor={m.cor}
                    />
                  ))}
                </div>
              </div>
            ) : (
              /* ── Médias gerais ── */
              <>
                <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '0.5px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>
                    Perfil do aprovado — médias 2ª fase
                  </div>
                  {MATERIAS.map(m => (
                    <BarraMateria
                      key={m.key}
                      label={m.label}
                      value={avg(base.map(a => a[m.key]))}
                      max={10}
                      cor={m.cor}
                    />
                  ))}
                  <div style={{
                    background: '#FEF9C3', borderRadius: 10, padding: '10px 12px', marginTop: 12,
                    fontSize: 12, color: '#92400E', lineHeight: 1.5,
                  }}>
                    <strong>Insight:</strong> Port./Red. é universalmente o ponto mais fraco —{' '}
                    {avg(base.map(a => a.portRed)).toFixed(2)} de média, vs. Matemática em{' '}
                    {avg(base.map(a => a.matematica)).toFixed(2)}.
                  </div>
                </div>

                {/* Correlação */}
                <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '0.5px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>1ª fase × 2ª fase</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 28, fontWeight: 800, color: '#1e40af' }}>{correlacao.toFixed(2)}</div>
                      <div style={{ fontSize: 11, color: '#888' }}>correlação (Pearson)</div>
                    </div>
                    <div style={{ flex: 1, fontSize: 12, color: '#555', lineHeight: 1.6 }}>
                      Correlação <strong>moderada</strong>: quem vai bem na 1ª fase tem vantagem, mas a 2ª fase exige habilidades distintas.
                      Virar na 2ª fase é real e comum.
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Comparativo 2024 × 2025 */}
        <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '0.5px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', marginBottom: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>Comparativo 2024 × 2025</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {[
              { titulo: 'Ampla Concorrência', dados24: comp2024ac, dados25: comp2025ac, cor: '#1e40af' },
              { titulo: 'Cota Racial', dados24: comp2024co, dados25: comp2025co, cor: '#f97316' },
            ].map(({ titulo, dados24, dados25, cor }) => (
              <div key={titulo} style={{ background: '#F8FAFC', borderRadius: 12, padding: 16, border: '0.5px solid rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: cor, marginBottom: 12 }}>{titulo}</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <td style={{ color: '#999', paddingBottom: 6 }}></td>
                      <td style={{ color: '#999', textAlign: 'right', paddingBottom: 6 }}>2024</td>
                      <td style={{ color: '#999', textAlign: 'right', paddingBottom: 6 }}>2025</td>
                      <td style={{ color: '#999', textAlign: 'right', paddingBottom: 6 }}>Δ</td>
                    </tr>
                  </thead>
                  <tbody>
                    {MATERIAS.map(m => {
                      const v24 = avg(dados24.map(a => a[m.key]))
                      const v25 = avg(dados25.map(a => a[m.key]))
                      const delta = v25 - v24
                      return (
                        <tr key={m.key}>
                          <td style={{ padding: '3px 0', color: '#444', fontWeight: 500 }}>{m.label}</td>
                          <td style={{ textAlign: 'right', color: '#666' }}>{v24.toFixed(2)}</td>
                          <td style={{ textAlign: 'right', color: '#666' }}>{v25.toFixed(2)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: delta > 0.02 ? '#16a34a' : delta < -0.02 ? '#ef4444' : '#999' }}>
                            {delta > 0 ? '+' : ''}{delta.toFixed(2)}
                          </td>
                        </tr>
                      )
                    })}
                    <tr style={{ borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
                      <td style={{ padding: '5px 0', fontWeight: 700 }}>Média geral</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{avg(dados24.map(a => a.media2fase)).toFixed(3)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{avg(dados25.map(a => a.media2fase)).toFixed(3)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: avg(dados25.map(a => a.media2fase)) > avg(dados24.map(a => a.media2fase)) ? '#16a34a' : '#ef4444' }}>
                        {(avg(dados25.map(a => a.media2fase)) - avg(dados24.map(a => a.media2fase)) > 0 ? '+' : '')}
                        {(avg(dados25.map(a => a.media2fase)) - avg(dados24.map(a => a.media2fase))).toFixed(3)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>

        {/* Ranking de estados */}
        <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '0.5px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', marginBottom: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Ranking de estados</div>
          <div style={{ fontSize: 11, color: '#999', marginBottom: 16 }}>Todos os aprovados 2024–2025. Mínimo: 2 aprovados.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 8 }}>
            {rankingEstados.map(([uf, info], i) => (
              <div key={uf} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                borderRadius: 10, background: '#F8FAFC',
                border: `0.5px solid ${estadoSelecionado === uf ? '#f97316' : 'rgba(0,0,0,0.06)'}`,
                cursor: 'pointer',
              }}
                onClick={() => setEstadoSelecionado(estadoSelecionado === uf ? null : uf)}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', background: i < 3 ? '#fef9c3' : '#F0F0F0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: i < 3 ? '#92400e' : '#666', flexShrink: 0,
                }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{uf}</span>
                    <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>{info.total} aprovados</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                    Média {info.media2fase.toFixed(3)} · Mat {info.matematica.toFixed(2)} · Fís {info.fisica.toFixed(2)} · Port {info.portRed.toFixed(2)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabela completa */}
        <div style={{ background: 'white', borderRadius: 16, border: '0.5px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ padding: '16px 20px', borderBottom: '0.5px solid rgba(0,0,0,0.06)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              Todos os aprovados
              <span style={{ fontSize: 12, color: '#888', fontWeight: 400, marginLeft: 8 }}>
                ({tabelaOrdenada.length})
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#aaa' }} />
                <input
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar por nome ou banca..."
                  style={{
                    width: '100%', padding: '7px 10px 7px 30px', borderRadius: 10,
                    border: '0.5px solid rgba(0,0,0,0.15)', fontSize: 13,
                    background: '#F8FAFC', outline: 'none', boxSizing: 'border-box',
                    fontFamily: 'DM Sans, sans-serif',
                  }}
                />
              </div>
            </div>
            <button
              onClick={() => setTabelaAberta(v => !v)}
              style={{ fontSize: 12, color: '#f97316', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              {tabelaAberta ? <><ChevronUp size={14} /> Recolher</> : <><ChevronDown size={14} /> Expandir</>}
            </button>
          </div>

          {tabelaAberta && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#F8FAFC' }}>
                    {[
                      { col: 'nome' as const, label: 'Nome' },
                      { col: 'ano' as const, label: 'Ano' },
                      { col: 'banca' as const, label: 'Banca' },
                      { col: 'media1fase' as const, label: '1ª Fase' },
                      { col: 'matematica' as const, label: 'Mat.' },
                      { col: 'fisica' as const, label: 'Fís.' },
                      { col: 'quimica' as const, label: 'Quím.' },
                      { col: 'portRed' as const, label: 'Port.' },
                      { col: 'media2fase' as const, label: '2ª Fase' },
                      { col: 'classificacao' as const, label: 'Classif.' },
                    ].map(({ col, label }) => (
                      <th key={col}
                        onClick={() => toggleOrdem(col)}
                        style={{
                          padding: '10px 12px', textAlign: col === 'nome' || col === 'banca' ? 'left' : 'right',
                          fontWeight: 600, color: ordenacao === col ? '#f97316' : '#666',
                          cursor: 'pointer', whiteSpace: 'nowrap',
                          borderBottom: '0.5px solid rgba(0,0,0,0.08)',
                          userSelect: 'none',
                        }}
                      >
                        {label} <OrdIcon col={col} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tabelaOrdenada.map((a, i) => (
                    <tr key={i} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#F9F9F9')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '8px 12px', fontWeight: 500, color: '#222' }}>
                        {a.nome.charAt(0) + a.nome.slice(1).toLowerCase()}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#666' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 8,
                          background: a.ano === 2025 ? '#fff7ed' : '#F5F3FF',
                          color: a.ano === 2025 ? '#1e40af' : '#f97316',
                        }}>{a.ano}</span>
                      </td>
                      <td style={{ padding: '8px 12px', color: '#555' }}>
                        {a.banca.charAt(0) + a.banca.slice(1).toLowerCase()}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#555' }}>{a.media1fase.toFixed(4)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#3B82F6', fontWeight: 600 }}>{a.matematica.toFixed(3)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#8B5CF6', fontWeight: 600 }}>{a.fisica.toFixed(3)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#10B981', fontWeight: 600 }}>{a.quimica.toFixed(3)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#F59E0B', fontWeight: 600 }}>{a.portRed.toFixed(4)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#166534' }}>{a.media2fase.toFixed(4)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#888' }}>#{a.classificacao}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
