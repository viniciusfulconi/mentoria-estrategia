'use client'
import { useState, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import Nav from '@/components/Nav'
import MapaBrasilIME, { EstadoInfoIME } from './MapaBrasil'
import { APROVADOS_IME, AprovadoIME } from '@/lib/data/aprovadosIME'
import { MapPin, ChevronDown, ChevronUp, Search, X } from 'lucide-react'

const MATERIAS = [
  { key: 'matematica' as const, label: 'Matemática', cor: '#3B82F6', peso: 3 },
  { key: 'fisica' as const,     label: 'Física',     cor: '#8B5CF6', peso: 2.5 },
  { key: 'quimica' as const,    label: 'Química',    cor: '#10B981', peso: 2.5 },
  { key: 'portugues' as const,  label: 'Português',  cor: '#F59E0B', peso: 1 },
  { key: 'ingles' as const,     label: 'Inglês',     cor: '#EF4444', peso: 1 },
]

function avg(arr: number[]) {
  if (!arr.length) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function buildEstadoDados(lista: AprovadoIME[]): Record<string, EstadoInfoIME> {
  const map: Record<string, { itens: AprovadoIME[]; cidades: Record<string, number> }> = {}
  lista.forEach(a => {
    if (!map[a.estado]) map[a.estado] = { itens: [], cidades: {} }
    map[a.estado].itens.push(a)
    map[a.estado].cidades[a.cidade] = (map[a.estado].cidades[a.cidade] || 0) + 1
  })
  const result: Record<string, EstadoInfoIME> = {}
  Object.entries(map).forEach(([uf, { itens, cidades }]) => {
    result[uf] = {
      total: itens.length,
      media: avg(itens.map(a => a.media)),
      matematica: avg(itens.map(a => a.matematica)),
      fisica: avg(itens.map(a => a.fisica)),
      quimica: avg(itens.map(a => a.quimica)),
      portugues: avg(itens.map(a => a.portugues)),
      ingles: avg(itens.map(a => a.ingles)),
      cidades: Object.entries(cidades)
        .map(([cidade, total]) => ({ cidade, total }))
        .sort((a, b) => b.total - a.total),
    }
  })
  return result
}

function BarraMateria({ label, value, max, cor, peso }: { label: string; value: number; max: number; cor: string; peso: number }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 12, color: '#555', fontWeight: 500 }}>
          {label}
          <span style={{ fontSize: 10, color: '#aaa', marginLeft: 5 }}>×{peso}</span>
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#222' }}>{value.toFixed(3)}</span>
      </div>
      <div style={{ background: '#F0F0F0', borderRadius: 6, height: 8, overflow: 'hidden' }}>
        <div style={{ width: `${(value / max) * 100}%`, height: '100%', background: cor, borderRadius: 6, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}

function CardStat({ label, value, sub, cor }: { label: string; value: string | number; sub?: string; cor?: string }) {
  return (
    <div style={{
      background: 'white', borderRadius: 14, padding: '16px 18px',
      border: '0.5px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      flex: 1, minWidth: 100,
    }}>
      <div style={{ fontSize: 11, color: '#888', fontWeight: 500, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: cor || '#1a1a1a', lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#999', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

export default function AprovadosIME() {
  const { perfil, loading: authLoading } = useAuth()
  const router = useRouter()

  const [anoFiltro, setAnoFiltro] = useState<number | null>(null)
  const [modalidadeFiltro, setModalidadeFiltro] = useState<string | null>(null)
  const [listaFiltro, setListaFiltro] = useState<string | null>(null)
  const [estadoSelecionado, setEstadoSelecionado] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [ordenacao, setOrdenacao] = useState<keyof AprovadoIME>('media')
  const [ordemDesc, setOrdemDesc] = useState(true)
  const [tabelaAberta, setTabelaAberta] = useState(false)

  useEffect(() => {
    if (!authLoading && perfil && perfil.papel !== 'coordenador' && perfil.papel !== 'direcao') {
      router.replace('/')
    }
  }, [authLoading, perfil])

  const filtrados = useMemo(() => {
    let lista = APROVADOS_IME
    if (anoFiltro) lista = lista.filter(a => a.ano === anoFiltro)
    if (modalidadeFiltro) lista = lista.filter(a => a.modalidade === modalidadeFiltro)
    if (listaFiltro) lista = lista.filter(a => a.lista === listaFiltro)
    if (estadoSelecionado) lista = lista.filter(a => a.estado === estadoSelecionado)
    if (busca) lista = lista.filter(a => a.nome.toLowerCase().includes(busca.toLowerCase()) || a.cidade.toLowerCase().includes(busca.toLowerCase()))
    return lista
  }, [anoFiltro, modalidadeFiltro, listaFiltro, estadoSelecionado, busca])

  const estadoDados = useMemo(() => buildEstadoDados(filtrados), [filtrados])
  const infoEstado = estadoSelecionado ? estadoDados[estadoSelecionado] : null

  const tabelaOrdenada = useMemo(() => {
    return [...filtrados].sort((a, b) => {
      const va = a[ordenacao] as number
      const vb = b[ordenacao] as number
      return ordemDesc ? vb - va : va - vb
    })
  }, [filtrados, ordenacao, ordemDesc])

  // base sem filtro de estado (para os cards e gráficos)
  const base = useMemo(() => {
    let lista = APROVADOS_IME
    if (anoFiltro) lista = lista.filter(a => a.ano === anoFiltro)
    if (modalidadeFiltro) lista = lista.filter(a => a.modalidade === modalidadeFiltro)
    if (listaFiltro) lista = lista.filter(a => a.lista === listaFiltro)
    return lista
  }, [anoFiltro, modalidadeFiltro, listaFiltro])

  const mediaGeral = avg(base.map(a => a.media))
  const mediasMaterias = MATERIAS.map(m => ({ ...m, value: avg(base.map(a => a[m.key])) }))
  const pontosOrdenados = [...mediasMaterias].sort((a, b) => a.value - b.value)
  const maisFraco = pontosOrdenados[0]
  const maisForte = pontosOrdenados[pontosOrdenados.length - 1]

  // Comparativo 2025 × 2026
  const comp25ac = APROVADOS_IME.filter(a => a.ano === 2025 && a.modalidade === 'Ativa' && a.lista === 'AC')
  const comp26ac = APROVADOS_IME.filter(a => a.ano === 2026 && a.modalidade === 'Ativa' && a.lista === 'AC')
  const comp25co = APROVADOS_IME.filter(a => a.ano === 2025 && a.modalidade === 'Ativa' && a.lista === 'Cotas')
  const comp26co = APROVADOS_IME.filter(a => a.ano === 2026 && a.modalidade === 'Ativa' && a.lista === 'Cotas')

  // Ranking de estados
  const rankingEstados = Object.entries(buildEstadoDados(APROVADOS_IME))
    .filter(([, d]) => d.total >= 2)
    .sort((a, b) => b[1].total - a[1].total)

  function toggleOrdem(col: keyof AprovadoIME) {
    if (ordenacao === col) setOrdemDesc(v => !v)
    else { setOrdenacao(col); setOrdemDesc(true) }
  }

  function OrdIcon({ col }: { col: keyof AprovadoIME }) {
    if (ordenacao !== col) return <span style={{ color: '#ccc', fontSize: 10 }}>↕</span>
    return ordemDesc ? <ChevronDown size={12} color="#2563EB" /> : <ChevronUp size={12} color="#2563EB" />
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
          <div style={{ fontSize: 17, fontWeight: 700 }}>Aprovados no IME</div>
          <div style={{ fontSize: 11, color: '#999', marginTop: 1 }}>
            {base.length} aprovados · Vestibulares 2024/25–2025/26
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[2025, 2026].map(ano => (
            <button key={ano} onClick={() => setAnoFiltro(anoFiltro === ano ? null : ano)} style={{
              fontSize: 12, fontWeight: 500, padding: '5px 12px', borderRadius: 20,
              border: '1px solid', cursor: 'pointer',
              background: anoFiltro === ano ? '#1e40af' : 'transparent',
              borderColor: anoFiltro === ano ? '#1e40af' : 'rgba(0,0,0,0.15)',
              color: anoFiltro === ano ? 'white' : '#444',
            }}>{ano}</button>
          ))}
          {['Ativa', 'Reserva'].map(m => (
            <button key={m} onClick={() => setModalidadeFiltro(modalidadeFiltro === m ? null : m)} style={{
              fontSize: 12, fontWeight: 500, padding: '5px 12px', borderRadius: 20,
              border: '1px solid', cursor: 'pointer',
              background: modalidadeFiltro === m ? '#7c3aed' : 'transparent',
              borderColor: modalidadeFiltro === m ? '#7c3aed' : 'rgba(0,0,0,0.15)',
              color: modalidadeFiltro === m ? 'white' : '#444',
            }}>{m}</button>
          ))}
          {['AC', 'Cotas'].map(l => (
            <button key={l} onClick={() => setListaFiltro(listaFiltro === l ? null : l)} style={{
              fontSize: 12, fontWeight: 500, padding: '5px 12px', borderRadius: 20,
              border: '1px solid', cursor: 'pointer',
              background: listaFiltro === l ? '#059669' : 'transparent',
              borderColor: listaFiltro === l ? '#059669' : 'rgba(0,0,0,0.15)',
              color: listaFiltro === l ? 'white' : '#444',
            }}>{l === 'AC' ? 'Ampla Conc.' : 'Cotas'}</button>
          ))}
          {(anoFiltro || modalidadeFiltro || listaFiltro || estadoSelecionado) && (
            <button onClick={() => { setAnoFiltro(null); setModalidadeFiltro(null); setListaFiltro(null); setEstadoSelecionado(null) }} style={{
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
          <CardStat label="Total aprovados" value={base.length} sub="2025 + 2026" cor="#166534" />
          <CardStat label="Estados" value={Object.keys(buildEstadoDados(base)).length} sub="com aprovados" />
          <CardStat label="Cidades" value={new Set(base.map(a => a.cidade)).size} sub="locais de prova" />
          <CardStat label="Média geral" value={mediaGeral.toFixed(3)} sub="todos os filtros" cor="#1e40af" />
          <CardStat
            label="Corte (Ativa AC)"
            value={anoFiltro === 2025 ? '7,615' : anoFiltro === 2026 ? '8,225' : '~7,92'}
            sub={anoFiltro ? `${anoFiltro}` : '2025–2026'}
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
                  marginLeft: 10, fontSize: 11, color: '#888', background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                }}>
                  ver todos
                </button>
              )}
            </div>
            <div style={{ fontSize: 11, color: '#999', marginBottom: 16 }}>Clique num estado para ver o detalhe</div>
            <MapaBrasilIME
              dados={estadoDados}
              estadoSelecionado={estadoSelecionado}
              onSelecionar={setEstadoSelecionado}
            />
          </div>

          {/* Painel direito */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {estadoSelecionado && infoEstado ? (
              <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '0.5px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{estadoSelecionado}</div>
                    <div style={{ fontSize: 12, color: '#888' }}>{infoEstado.total} aprovado{infoEstado.total > 1 ? 's' : ''}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: '#888' }}>Média</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#1e40af' }}>{infoEstado.media.toFixed(3)}</div>
                  </div>
                </div>

                {/* Cidades */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <MapPin size={10} />Cidades
                  </div>
                  {infoEstado.cidades.map(c => (
                    <div key={c.cidade} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '0.5px solid #F0F0F0' }}>
                      <span style={{ fontSize: 13, color: '#444', fontWeight: 500 }}>{c.cidade}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#1e40af', background: '#EFF6FF', borderRadius: 12, padding: '2px 8px' }}>{c.total}</span>
                    </div>
                  ))}
                </div>

                {/* Médias por matéria */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                    Médias por matéria
                  </div>
                  {MATERIAS.map(m => (
                    <BarraMateria key={m.key} label={m.label} value={infoEstado[m.key]} max={10} cor={m.cor} peso={m.peso} />
                  ))}
                </div>
              </div>
            ) : (
              <>
                {/* Perfil do aprovado */}
                <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '0.5px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Perfil do aprovado — médias por matéria</div>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 14 }}>
                    Fórmula: (3×Mat + 2,5×Fís + 2,5×Quím + 1×Port + 1×Ing) / 10
                  </div>
                  {mediasMaterias.map(m => (
                    <BarraMateria key={m.key} label={m.label} value={m.value} max={10} cor={m.cor} peso={m.peso} />
                  ))}
                  {maisFraco && maisForte && (
                    <div style={{ background: '#FEF9C3', borderRadius: 10, padding: '10px 12px', marginTop: 12, fontSize: 12, color: '#92400E', lineHeight: 1.5 }}>
                      <strong>Insight:</strong> {maisFraco.label} é o ponto mais fraco —{' '}
                      {maisFraco.value.toFixed(2)} de média, vs. {maisForte.label} em {maisForte.value.toFixed(2)}.
                    </div>
                  )}
                </div>

                {/* Pesos */}
                <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '0.5px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Pesos na nota final</div>
                  {MATERIAS.map(m => {
                    const totalPesos = MATERIAS.reduce((s, x) => s + x.peso, 0)
                    const pct = (m.peso / totalPesos) * 100
                    return (
                      <div key={m.key} style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                          <span style={{ fontSize: 12, color: '#555', fontWeight: 500 }}>{m.label}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: m.cor }}>{pct.toFixed(0)}% (×{m.peso})</span>
                        </div>
                        <div style={{ background: '#F0F0F0', borderRadius: 6, height: 8, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: m.cor, borderRadius: 6 }} />
                        </div>
                      </div>
                    )
                  })}
                  <div style={{ background: '#F0F9FF', borderRadius: 10, padding: '10px 12px', marginTop: 12, fontSize: 12, color: '#0369A1', lineHeight: 1.5 }}>
                    <strong>Estratégia:</strong> Matemática vale 30% — maior impacto isolado. Fís + Quím juntas valem 50%.
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Comparativo 2025 × 2026 */}
        <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '0.5px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', marginBottom: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Comparativo 2025 × 2026</div>
          <div style={{ fontSize: 11, color: '#999', marginBottom: 16 }}>Ativa — Ampla Concorrência e Cotas</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {[
              { titulo: 'Ativa — AC', dados25: comp25ac, dados26: comp26ac, cor: '#1e40af' },
              { titulo: 'Ativa — Cotas', dados25: comp25co, dados26: comp26co, cor: '#7c3aed' },
            ].map(({ titulo, dados25, dados26, cor }) => (
              <div key={titulo} style={{ background: '#F8FAFC', borderRadius: 12, padding: 16, border: '0.5px solid rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: cor, marginBottom: 12 }}>{titulo}</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <td style={{ color: '#999', paddingBottom: 6 }}></td>
                      <td style={{ color: '#999', textAlign: 'right', paddingBottom: 6 }}>2025</td>
                      <td style={{ color: '#999', textAlign: 'right', paddingBottom: 6 }}>2026</td>
                      <td style={{ color: '#999', textAlign: 'right', paddingBottom: 6 }}>Δ</td>
                    </tr>
                  </thead>
                  <tbody>
                    {MATERIAS.map(m => {
                      const v25 = avg(dados25.map(a => a[m.key]))
                      const v26 = avg(dados26.map(a => a[m.key]))
                      const delta = v26 - v25
                      return (
                        <tr key={m.key}>
                          <td style={{ padding: '3px 0', color: '#444', fontWeight: 500 }}>{m.label}</td>
                          <td style={{ textAlign: 'right', color: '#666' }}>{v25.toFixed(2)}</td>
                          <td style={{ textAlign: 'right', color: '#666' }}>{v26.toFixed(2)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: delta > 0.02 ? '#16a34a' : delta < -0.02 ? '#ef4444' : '#999' }}>
                            {delta > 0 ? '+' : ''}{delta.toFixed(2)}
                          </td>
                        </tr>
                      )
                    })}
                    <tr style={{ borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
                      <td style={{ padding: '5px 0', fontWeight: 700 }}>Média geral</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{avg(dados25.map(a => a.media)).toFixed(3)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{avg(dados26.map(a => a.media)).toFixed(3)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: avg(dados26.map(a => a.media)) > avg(dados25.map(a => a.media)) ? '#16a34a' : '#ef4444' }}>
                        {(avg(dados26.map(a => a.media)) - avg(dados25.map(a => a.media)) > 0 ? '+' : '')}
                        {(avg(dados26.map(a => a.media)) - avg(dados25.map(a => a.media))).toFixed(3)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>

        {/* Cortes por lista */}
        <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '0.5px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', marginBottom: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>Cortes de classificação</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            {[
              { label: '2025 — Ativa AC',     corte: 7.615, cor: '#1e40af' },
              { label: '2025 — Ativa Cotas',  corte: 6.660, cor: '#7c3aed' },
              { label: '2025 — Reserva AC',   corte: 7.745, cor: '#0369a1' },
              { label: '2025 — Reserva Cotas', corte: 5.285, cor: '#9333ea' },
              { label: '2026 — Ativa AC',     corte: 8.225, cor: '#1e40af' },
              { label: '2026 — Ativa Cotas',  corte: 7.690, cor: '#7c3aed' },
              { label: '2026 — Reserva AC',   corte: 8.085, cor: '#0369a1' },
              { label: '2026 — Reserva Cotas', corte: 7.195, cor: '#9333ea' },
            ].map(({ label, corte, cor }) => (
              <div key={label} style={{ background: '#F8FAFC', borderRadius: 12, padding: '12px 14px', border: '0.5px solid rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: cor }}>{corte.toFixed(3)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Ranking de estados */}
        <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '0.5px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', marginBottom: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Ranking de estados</div>
          <div style={{ fontSize: 11, color: '#999', marginBottom: 16 }}>Todos os aprovados 2025–2026. Mínimo: 2 aprovados.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 8 }}>
            {rankingEstados.map(([uf, info], i) => (
              <div key={uf} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                borderRadius: 10, background: '#F8FAFC',
                border: `0.5px solid ${estadoSelecionado === uf ? '#2563EB' : 'rgba(0,0,0,0.06)'}`,
                cursor: 'pointer',
              }}
                onClick={() => setEstadoSelecionado(estadoSelecionado === uf ? null : uf)}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', background: i < 3 ? '#eff6ff' : '#F0F0F0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: i < 3 ? '#1e40af' : '#666', flexShrink: 0,
                }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{uf}</span>
                    <span style={{ fontSize: 11, color: '#1e40af', fontWeight: 600 }}>{info.total} aprovados</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                    Média {info.media.toFixed(3)} · Mat {info.matematica.toFixed(2)} · Fís {info.fisica.toFixed(2)} · Ing {info.ingles.toFixed(2)}
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
              <span style={{ fontSize: 12, color: '#888', fontWeight: 400, marginLeft: 8 }}>({tabelaOrdenada.length})</span>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#aaa' }} />
                <input
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar por nome ou cidade..."
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
              style={{ fontSize: 12, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
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
                      { col: 'nome' as const,        label: 'Nome',      sortable: false },
                      { col: 'ano' as const,         label: 'Ano',       sortable: true },
                      { col: 'modalidade' as const,  label: 'Modalidade', sortable: false },
                      { col: 'lista' as const,       label: 'Lista',     sortable: false },
                      { col: 'cidade' as const,      label: 'Cidade',    sortable: false },
                      { col: 'matematica' as const,  label: 'Mat.',      sortable: true },
                      { col: 'fisica' as const,      label: 'Fís.',      sortable: true },
                      { col: 'quimica' as const,     label: 'Quím.',     sortable: true },
                      { col: 'portugues' as const,   label: 'Port.',     sortable: true },
                      { col: 'ingles' as const,      label: 'Ing.',      sortable: true },
                      { col: 'media' as const,       label: 'Média',     sortable: true },
                      { col: 'classificacao' as const, label: 'Classif.', sortable: true },
                    ].map(({ col, label, sortable }) => (
                      <th key={col}
                        onClick={() => sortable && toggleOrdem(col)}
                        style={{
                          padding: '10px 12px',
                          textAlign: !sortable ? 'left' : 'right',
                          fontWeight: 600, color: ordenacao === col ? '#2563EB' : '#666',
                          cursor: sortable ? 'pointer' : 'default',
                          whiteSpace: 'nowrap', borderBottom: '0.5px solid rgba(0,0,0,0.08)',
                          userSelect: 'none',
                        }}
                      >
                        {label} {sortable && <OrdIcon col={col} />}
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
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 8,
                          background: a.ano === 2026 ? '#EFF6FF' : '#F5F3FF',
                          color: a.ano === 2026 ? '#1e40af' : '#7c3aed',
                        }}>{a.ano}</span>
                      </td>
                      <td style={{ padding: '8px 12px', color: '#555' }}>{a.modalidade}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 8,
                          background: a.lista === 'AC' ? '#F0FDF4' : '#FFF7ED',
                          color: a.lista === 'AC' ? '#166534' : '#c2410c',
                        }}>{a.lista === 'AC' ? 'Ampla' : 'Cotas'}</span>
                      </td>
                      <td style={{ padding: '8px 12px', color: '#555' }}>{a.cidade}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#3B82F6', fontWeight: 600 }}>{a.matematica.toFixed(1)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#8B5CF6', fontWeight: 600 }}>{a.fisica.toFixed(1)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#10B981', fontWeight: 600 }}>{a.quimica.toFixed(1)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#F59E0B', fontWeight: 600 }}>{a.portugues.toFixed(1)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#EF4444', fontWeight: 600 }}>{a.ingles.toFixed(1)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#166534' }}>{a.media.toFixed(3)}</td>
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
