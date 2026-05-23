'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import Nav from '@/components/Nav'
import Link from 'next/link'
import type { AtendimentoMentoria } from '@/lib/supabase'

export default function Atendimentos() {
  const { perfil } = useAuth()
  const [dados, setDados] = useState<AtendimentoMentoria[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [filtroMentor, setFiltroMentor] = useState('todos')
  const [filtroMes, setFiltroMes] = useState('todos')
  const [aba, setAba] = useState<'lista' | 'financeiro' | 'psico'>('lista')
  const [limite, setLimite] = useState(50)

  useEffect(() => { carregar() }, [perfil])

  async function carregar() {
    setErro(null)
    let q = supabase.from('atendimentos_mentoria').select('*').order('data_atendimento', { ascending: false })
    if (perfil?.papel === 'mentor') q = q.eq('mentor', perfil.mentor_nome || '')
    const { data, error } = await q
    if (error) { setErro('Falha ao carregar atendimentos.'); setLoading(false); return }
    setDados(data || [])
    setLoading(false)
  }

  const mentores = [...new Set(dados.map(d => d.mentor))].sort()
  // Gera meses únicos a partir da data do atendimento (formato: MM/YYYY)
  const mesesUnicos = [...new Set(dados.map(d => {
    if (!d.data_atendimento) return null
    const dt = new Date(d.data_atendimento)
    return `${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`
  }).filter(Boolean))].sort() as string[]
  const meses = mesesUnicos

  function mesLabel(m: string) {
    const [mm, yyyy] = m.split('/')
    const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
    return `${nomes[Number(mm) - 1]} ${yyyy}`
  }

  function mesDaData(data: string) {
    if (!data) return ''
    const dt = new Date(data)
    return `${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`
  }

  const filtrados = dados.filter(d => {
    if (filtroMentor !== 'todos' && d.mentor !== filtroMentor) return false
    if (filtroMes !== 'todos' && mesDaData(d.data_atendimento) !== filtroMes) return false
    return true
  })

  // Financeiro por mentor
  const financeiroMentor = mentores.map(m => {
    const ats = filtrados.filter(d => d.mentor === m)
    const totalMin = ats.reduce((a, d) => a + (d.duracao_minutos || 0), 0)
    const totalValor = ats.reduce((a, d) => a + Number(d.valor_pago || 0), 0)
    return { mentor: m, count: ats.length, totalMin, totalValor }
  }).sort((a, b) => b.totalValor - a.totalValor)

  const totalGeral = filtrados.reduce((a, d) => a + Number(d.valor_pago || 0), 0)
  const psico = filtrados.filter(d => d.encaminhamento_psico)

  function formatMin(min: number) {
    const h = Math.floor(min / 60)
    const m = min % 60
    return h > 0 ? `${h}h${m > 0 ? ` ${m}min` : ''}` : `${m}min`
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 17, fontWeight: 600 }}>Atendimentos</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {perfil?.papel === 'coordenador' && (
              <Link href="/atendimentos/upload" style={{ textDecoration: 'none', background: '#F1F5F9', color: '#666', borderRadius: 10, padding: '6px 12px', fontSize: 12 }}>↑ Import</Link>
            )}
            <Link href="/atendimentos/novo" style={{ textDecoration: 'none', background: '#2563EB', color: 'white', borderRadius: 10, padding: '6px 12px', fontSize: 12, fontWeight: 500 }}>+ Novo</Link>
          </div>
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 8 }}>
          {perfil?.papel === 'coordenador' && (
            <select value={filtroMentor} onChange={e => setFiltroMentor(e.target.value)}
              style={{ fontSize: 11, padding: '4px 8px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.12)', background: '#F7F6F3', fontFamily: 'DM Sans,sans-serif' }}>
              <option value="todos">Todos os mentores</option>
              {mentores.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
          <select value={filtroMes} onChange={e => setFiltroMes(e.target.value)}
            style={{ fontSize: 11, padding: '4px 8px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.12)', background: '#F7F6F3', fontFamily: 'DM Sans,sans-serif' }}>
            <option value="todos">Todos os meses</option>
            {meses.map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
          </select>
        </div>

        {/* Abas */}
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { id: 'lista', label: `📋 Lista (${filtrados.length})` },
            { id: 'financeiro', label: '💰 Financeiro' },
            { id: 'psico', label: `🧠 Psico (${psico.length})` },
          ].map(a => (
            <button key={a.id} onClick={() => setAba(a.id as any)} style={{
              padding: '4px 12px', borderRadius: 14, fontSize: 11, border: 'none',
              background: aba === a.id ? '#1a1a1a' : '#F1F5F9',
              color: aba === a.id ? 'white' : '#666',
              cursor: 'pointer', fontFamily: 'DM Sans,sans-serif'
            }}>{a.label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {loading ? <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>Carregando...</div>
        : erro ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 13, color: '#DC2626', marginBottom: 12 }}>{erro}</div>
            <button onClick={carregar} style={{ padding: '8px 20px', borderRadius: 10, background: '#2563EB', color: 'white', border: 'none', fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Tentar novamente</button>
          </div>
        ) : (
          <>
            {/* LISTA */}
            {aba === 'lista' && filtrados.slice(0, limite).map(d => (
              <div key={d.id} className="card" style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>{d.aluno || 'Atendimento coletivo'}</div>
                    <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{d.mentor} · {new Date(d.data_atendimento).toLocaleDateString('pt-BR')}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#16A34A' }}>R$ {Number(d.valor_pago || 0).toFixed(2)}</div>
                    <div style={{ fontSize: 10, color: '#999' }}>{formatMin(d.duracao_minutos || 0)}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: d.tipo === 'Individual' ? '#EFF6FF' : '#DCFCE7', color: d.tipo === 'Individual' ? '#1E40AF' : '#14532D' }}>{d.tipo}</span>
                  {d.encaminhamento_psico && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: '#FEF2F2', color: '#991B1B' }}>🧠 Psico</span>}
                  {d.arquivo_gemini_url && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: '#DCFCE7', color: '#14532D' }}>📄 Docx</span>}
                  {d.link_gemini && !d.arquivo_gemini_url && <a href={d.link_gemini} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: '#F1F5F9', color: '#2563EB', textDecoration: 'none' }}>🔗 Gemini</a>}
                  {d.link_gravacao && <a href={d.link_gravacao} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: '#F1F5F9', color: '#2563EB', textDecoration: 'none' }}>▶ Gravação</a>}
                </div>
                {d.descricao && <div style={{ fontSize: 12, color: '#666', marginTop: 8, lineHeight: 1.5, borderTop: '0.5px solid rgba(0,0,0,0.06)', paddingTop: 8 }}>{d.descricao}</div>}
              </div>
            ))}

            {aba === 'lista' && filtrados.length > limite && (
              <button
                onClick={() => setLimite(l => l + 50)}
                style={{ width: '100%', padding: '12px', borderRadius: 12, border: '0.5px solid rgba(0,0,0,0.12)', background: 'white', color: '#2563EB', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', marginBottom: 10 }}
              >
                Carregar mais ({filtrados.length - limite} restantes)
              </button>
            )}

            {/* FINANCEIRO */}
            {aba === 'financeiro' && (
              <>
                <div style={{ background: '#2563EB', borderRadius: 14, padding: '16px 20px', marginBottom: 16, textAlign: 'center' }}>
                  <div style={{ fontSize: 32, fontWeight: 800, color: 'white' }}>R$ {totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>Total gasto · {filtrados.length} atendimentos</div>
                </div>
                {financeiroMentor.map(f => (
                  <div key={f.mentor} className="card" style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{f.mentor}</div>
                        <div style={{ fontSize: 11, color: '#999' }}>{f.count} atend. · {formatMin(f.totalMin)}</div>
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#16A34A' }}>R$ {f.totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                    </div>
                    <div style={{ height: 6, background: '#F1F5F9', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${totalGeral > 0 ? (f.totalValor/totalGeral)*100 : 0}%`, background: '#2563EB', borderRadius: 3 }} />
                    </div>
                    <div style={{ fontSize: 10, color: '#999', marginTop: 4 }}>{totalGeral > 0 ? ((f.totalValor/totalGeral)*100).toFixed(1) : 0}% do total</div>
                  </div>
                ))}
              </>
            )}

            {/* PSICOLÓGICO */}
            {aba === 'psico' && (
              psico.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                  <div>Nenhum encaminhamento psicológico neste período</div>
                </div>
              ) : psico.map(d => (
                <div key={d.id} className="card" style={{ marginBottom: 10, borderLeft: '3px solid #DC2626' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{d.aluno}</div>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>
                    {d.mentor} · {new Date(d.data_atendimento).toLocaleDateString('pt-BR')}
                  </div>
                  {d.solicitacao_aluno && <div style={{ fontSize: 12, color: '#DC2626', marginBottom: 4 }}>📌 {d.solicitacao_aluno}</div>}
                  {d.descricao && <div style={{ fontSize: 12, color: '#666', lineHeight: 1.5 }}>{d.descricao}</div>}
                </div>
              ))
            )}
          </>
        )}
      </div>
      <Nav />
    </div>
  )
}
