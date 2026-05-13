// @ts-nocheck
'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import Nav from '@/components/Nav'
import Link from 'next/link'

export default function Atendimentos() {
  const { perfil } = useAuth()
  const [dados, setDados] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroMentor, setFiltroMentor] = useState('todos')
  const [filtroMes, setFiltroMes] = useState('todos')
  const [aba, setAba] = useState<'lista'|'financeiro'|'psico'>('lista')

  useEffect(() => { carregar() }, [perfil])

  async function carregar() {
    let q = supabase.from('atendimentos_mentoria').select('*').order('data_atendimento', { ascending: false })
    if (perfil?.papel === 'mentor') q = q.eq('mentor', perfil.mentor_nome || '')
    const { data } = await q
    setDados(data || [])
    setLoading(false)
  }

  const mentores = [...new Set(dados.map(d => d.mentor))].sort()
  const meses = [...new Set(dados.map(d => d.mes).filter(Boolean))].sort()

  const filtrados = dados.filter(d => {
    if (filtroMentor !== 'todos' && d.mentor !== filtroMentor) return false
    if (filtroMes !== 'todos' && d.mes !== filtroMes) return false
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
              <Link href="/atendimentos/upload" style={{ textDecoration: 'none', background: '#F1EFE8', color: '#666', borderRadius: 10, padding: '6px 12px', fontSize: 12 }}>↑ Import</Link>
            )}
            <Link href="/atendimentos/novo" style={{ textDecoration: 'none', background: '#534AB7', color: 'white', borderRadius: 10, padding: '6px 12px', fontSize: 12, fontWeight: 500 }}>+ Novo</Link>
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
            {meses.map(m => <option key={m} value={m}>{m}</option>)}
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
              background: aba === a.id ? '#1a1a1a' : '#F1EFE8',
              color: aba === a.id ? 'white' : '#666',
              cursor: 'pointer', fontFamily: 'DM Sans,sans-serif'
            }}>{a.label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {loading ? <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>Carregando...</div> : (
          <>
            {/* LISTA */}
            {aba === 'lista' && filtrados.slice(0, 50).map(d => (
              <div key={d.id} className="card" style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>{d.aluno || 'Atendimento coletivo'}</div>
                    <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{d.mentor} · {new Date(d.data_atendimento).toLocaleDateString('pt-BR')}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1D9E75' }}>R$ {Number(d.valor_pago || 0).toFixed(2)}</div>
                    <div style={{ fontSize: 10, color: '#999' }}>{formatMin(d.duracao_minutos || 0)}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: d.tipo === 'Individual' ? '#EEEDFE' : '#E1F5EE', color: d.tipo === 'Individual' ? '#3C3489' : '#085041' }}>{d.tipo}</span>
                  {d.encaminhamento_psico && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: '#FCEBEB', color: '#791F1F' }}>🧠 Psico</span>}
                  {d.arquivo_gemini_url && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: '#EAF3DE', color: '#27500A' }}>📄 Docx</span>}
                  {d.link_gemini && !d.arquivo_gemini_url && <a href={d.link_gemini} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: '#F1EFE8', color: '#534AB7', textDecoration: 'none' }}>🔗 Gemini</a>}
                  {d.link_gravacao && <a href={d.link_gravacao} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: '#F1EFE8', color: '#534AB7', textDecoration: 'none' }}>▶ Gravação</a>}
                </div>
                {d.descricao && <div style={{ fontSize: 12, color: '#666', marginTop: 8, lineHeight: 1.5, borderTop: '0.5px solid rgba(0,0,0,0.06)', paddingTop: 8 }}>{d.descricao}</div>}
              </div>
            ))}

            {/* FINANCEIRO */}
            {aba === 'financeiro' && (
              <>
                <div style={{ background: '#534AB7', borderRadius: 14, padding: '16px 20px', marginBottom: 16, textAlign: 'center' }}>
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
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#1D9E75' }}>R$ {f.totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                    </div>
                    <div style={{ height: 6, background: '#F0EEE8', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${totalGeral > 0 ? (f.totalValor/totalGeral)*100 : 0}%`, background: '#534AB7', borderRadius: 3 }} />
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
                <div key={d.id} className="card" style={{ marginBottom: 10, borderLeft: '3px solid #E24B4A' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{d.aluno}</div>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>
                    {d.mentor} · {new Date(d.data_atendimento).toLocaleDateString('pt-BR')}
                  </div>
                  {d.solicitacao_aluno && <div style={{ fontSize: 12, color: '#E24B4A', marginBottom: 4 }}>📌 {d.solicitacao_aluno}</div>}
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
