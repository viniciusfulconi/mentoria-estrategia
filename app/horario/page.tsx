// @ts-nocheck
'use client'
import { useEffect, useState, useCallback } from 'react'
import { dbQuery, dbDelete } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import Nav from '@/components/Nav'
import Link from 'next/link'
import { corAtividade, formatHora, diasParaData, expandirRecorrentes, MESES, DIAS_SEMANA } from '@/lib/agenda'

type Visualizacao = 'dia' | 'semana' | 'mes' | 'ano'

export default function Horario() {
  const { perfil } = useAuth()
  const [atividades, setAtividades] = useState<any[]>([])
  const [vis, setVis] = useState<Visualizacao>('mes')
  const [dataAtual, setDataAtual] = useState(new Date())
  const [atividadeSelecionada, setAtividadeSelecionada] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [turmaId, setTurmaId] = useState<string | null>(null)

  useEffect(() => { carregarDados() }, [perfil])

  async function carregarDados() {
    if (!perfil) return

    const { data: turmas } = await dbQuery('turmas', { limit: '1' }, 'id')
    setTurmaId(turmas?.[0]?.id || null)

    const params: Record<string, string> = { order: 'data_inicio' }
    if (perfil.papel === 'aluno' && perfil.aluno_id) {
      params['or'] = `(aluno_id.eq.${perfil.aluno_id},aluno_id.is.null)`
    }
    const { data } = await dbQuery('atividades', params)
    setAtividades(data || [])
    setLoading(false)
  }

  // Calcula intervalo do mês/ano atual para expandir recorrentes
  const inicioMes = new Date(dataAtual.getFullYear(), dataAtual.getMonth(), 1)
  const fimMes = new Date(dataAtual.getFullYear(), dataAtual.getMonth() + 1, 0)
  const inicioAno = new Date(dataAtual.getFullYear(), 0, 1)
  const fimAno = new Date(dataAtual.getFullYear(), 11, 31)

  // Calcula intervalo da semana atual
  const inicioSemana = new Date(dataAtual)
  inicioSemana.setDate(dataAtual.getDate() - dataAtual.getDay())
  inicioSemana.setHours(0, 0, 0, 0)
  const fimSemana = new Date(inicioSemana)
  fimSemana.setDate(inicioSemana.getDate() + 6)
  fimSemana.setHours(23, 59, 59, 0)

  const atividadesExpandidas = expandirRecorrentes(
    atividades,
    vis === 'ano' ? inicioAno : vis === 'semana' ? inicioSemana : vis === 'mes' ? inicioMes : new Date(dataAtual.getFullYear(), dataAtual.getMonth(), dataAtual.getDate()),
    vis === 'ano' ? fimAno : vis === 'semana' ? fimSemana : vis === 'mes' ? fimMes : new Date(dataAtual.getFullYear(), dataAtual.getMonth(), dataAtual.getDate(), 23, 59)
  )

  // Vestibulares futuros
  const vestibulares = atividades.filter(a => a.tipo === 'vestibular' && diasParaData(a.data_inicio) >= 0)
    .sort((a, b) => new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime())

  // Atividades do dia selecionado
  function atividadesDoDia(data: Date): any[] {
    return atividadesExpandidas.filter(a => {
      const d = new Date(a.data_inicio)
      return d.getDate() === data.getDate() && d.getMonth() === data.getMonth() && d.getFullYear() === data.getFullYear()
    })
  }

  // Horas de estudo por matéria (semana atual)
  const horasEstudo: Record<string, number> = {}
  const hoje = new Date()
  const inicioSemanaHoje = new Date(hoje)
  inicioSemanaHoje.setDate(hoje.getDate() - hoje.getDay())
  const fimSemanaHoje = new Date(inicioSemanaHoje)
  fimSemanaHoje.setDate(inicioSemanaHoje.getDate() + 6)
  expandirRecorrentes(atividades, inicioSemanaHoje, fimSemanaHoje)
    .filter(a => a.tipo === 'estudo' && a.materia && a.data_fim)
    .forEach(a => {
      const h = (new Date(a.data_fim).getTime() - new Date(a.data_inicio).getTime()) / 3600000
      horasEstudo[a.materia] = (horasEstudo[a.materia] || 0) + h
    })

  function navAnterior() {
    const d = new Date(dataAtual)
    if (vis === 'dia') d.setDate(d.getDate() - 1)
    else if (vis === 'semana') d.setDate(d.getDate() - 7)
    else if (vis === 'mes') d.setMonth(d.getMonth() - 1)
    else d.setFullYear(d.getFullYear() - 1)
    setDataAtual(d)
  }

  function navProximo() {
    const d = new Date(dataAtual)
    if (vis === 'dia') d.setDate(d.getDate() + 1)
    else if (vis === 'semana') d.setDate(d.getDate() + 7)
    else if (vis === 'mes') d.setMonth(d.getMonth() + 1)
    else d.setFullYear(d.getFullYear() + 1)
    setDataAtual(d)
  }

  function tituloNav() {
    if (vis === 'dia') return dataAtual.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
    if (vis === 'semana') {
      const ini = new Date(dataAtual); ini.setDate(dataAtual.getDate() - dataAtual.getDay())
      const fim = new Date(ini); fim.setDate(ini.getDate() + 6)
      return `${ini.toLocaleDateString('pt-BR', { day:'2-digit', month:'short' })} – ${fim.toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric' })}`
    }
    if (vis === 'mes') return `${MESES[dataAtual.getMonth()]} ${dataAtual.getFullYear()}`
    return String(dataAtual.getFullYear())
  }

  const isCoord = perfil?.papel === 'coordenador'
  const isMentor = perfil?.papel === 'mentor'
  const isAluno = perfil?.papel === 'aluno'

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '12px 16px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 17, fontWeight: 600 }}>Horário</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {isCoord && (
              <div style={{ display: 'flex', gap: 4 }}>
                <Link href="/horario/nova-aula" style={{ textDecoration: 'none', background: '#E8E8E8', color: '#333', borderRadius: 8, padding: '5px 10px', fontSize: 11 }}>+ Aula</Link>
                <Link href="/horario/novo-simulado" style={{ textDecoration: 'none', background: '#FF7043', color: 'white', borderRadius: 8, padding: '5px 10px', fontSize: 11 }}>+ Simulado</Link>
                <Link href="/horario/novo-vestibular" style={{ textDecoration: 'none', background: '#212121', color: 'white', borderRadius: 8, padding: '5px 10px', fontSize: 11 }}>+ Vest.</Link>
              </div>
            )}
            {isMentor && (
              <Link href="/horario/mentor" style={{ textDecoration: 'none', background: '#2563EB', color: 'white', borderRadius: 8, padding: '5px 12px', fontSize: 11 }}>+ Estudo</Link>
            )}
            {isAluno && (
              <Link href="/horario/nova-atividade" style={{ textDecoration: 'none', background: '#2563EB', color: 'white', borderRadius: 8, padding: '5px 12px', fontSize: 11 }}>+ Pessoal</Link>
            )}
          </div>
        </div>

        {/* Visualização */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          {(['dia', 'semana', 'mes', 'ano'] as Visualizacao[]).map(v => (
            <button key={v} onClick={() => setVis(v)} style={{
              padding: '4px 12px', borderRadius: 16, fontSize: 11, border: 'none',
              background: vis === v ? '#2563EB' : '#F1F5F9', color: vis === v ? 'white' : '#666',
              cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
            }}>{v === 'dia' ? 'Dia' : v === 'semana' ? 'Semana' : v === 'mes' ? 'Mês' : 'Ano'}</button>
          ))}
        </div>

        {/* Navegação */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={navAnterior} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#2563EB' }}>‹</button>
          <div style={{ fontSize: 14, fontWeight: 600, textAlign: 'center', textTransform: 'capitalize' }}>{tituloNav()}</div>
          <button onClick={navProximo} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#2563EB' }}>›</button>
        </div>
      </div>

      {/* Vestibulares futuros */}
      {vestibulares.length > 0 && (
        <div style={{ padding: '8px 16px 0', display: 'flex', gap: 8, overflowX: 'auto' }}>
          {vestibulares.slice(0, 3).map(v => {
            const dias = diasParaData(v.data_inicio)
            return (
              <div key={v.id} style={{ flexShrink: 0, background: '#212121', color: 'white', borderRadius: 10, padding: '6px 12px', fontSize: 11 }}>
                <div style={{ fontWeight: 600 }}>{v.titulo}</div>
                <div style={{ opacity: 0.7, marginTop: 2 }}>{dias === 0 ? 'Hoje!' : `${dias} dias`}</div>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ padding: 16 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>Carregando...</div>
        ) : (
          <>
            {/* VISUALIZAÇÃO DIÁRIA */}
            {vis === 'dia' && (
              <ViewDia
                data={dataAtual}
                atividades={atividadesDoDia(dataAtual)}
                onSelect={setAtividadeSelecionada}
                isAluno={isAluno}
                perfil={perfil}
                onDelete={(id: string) => { setAtividades(prev => prev.filter(a => a.id !== id)); carregarDados() }}
              />
            )}

            {/* VISUALIZAÇÃO SEMANAL */}
            {vis === 'semana' && (
              <ViewSemana
                dataAtual={dataAtual}
                atividadesExpandidas={atividadesExpandidas}
                onSelect={setAtividadeSelecionada}
                onSelectDia={(d: Date) => { setDataAtual(d); setVis('dia') }}
              />
            )}

            {/* VISUALIZAÇÃO MENSAL */}
            {vis === 'mes' && (
              <ViewMes
                dataAtual={dataAtual}
                atividadesExpandidas={atividadesExpandidas}
                onSelectDia={(d: Date) => { setDataAtual(d); setVis('dia') }}
              />
            )}

            {/* VISUALIZAÇÃO ANUAL */}
            {vis === 'ano' && (
              <ViewAno
                ano={dataAtual.getFullYear()}
                atividadesExpandidas={atividadesExpandidas}
                onSelectMes={(m: number) => { const d = new Date(dataAtual); d.setMonth(m); setDataAtual(d); setVis('mes') }}
              />
            )}

            {/* Resumo horas de estudo */}
            {isAluno && Object.keys(horasEstudo).length > 0 && (
              <div className="card" style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>⏱ Horas de estudo esta semana</div>
                {Object.entries(horasEstudo).sort((a, b) => b[1] - a[1]).map(([mat, h]) => (
                  <div key={mat} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: '#666' }}>{mat}</span>
                    <span style={{ fontWeight: 600, color: '#2563EB' }}>{h.toFixed(1)}h</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal da atividade */}
      {atividadeSelecionada && (
        <div onClick={() => setAtividadeSelecionada(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 420, padding: '24px 20px 20px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            {/* Header colorido */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 16, height: 16, borderRadius: 4, background: corAtividade(atividadeSelecionada).bg, flexShrink: 0 }} />
              <div style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>{atividadeSelecionada.titulo}</div>
            </div>
            {atividadeSelecionada.materia && <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>📚 {atividadeSelecionada.materia}</div>}
            {atividadeSelecionada.professor && <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>👤 {atividadeSelecionada.professor}</div>}
            {atividadeSelecionada.data_inicio && (
              <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
                🕐 {formatHora(atividadeSelecionada.data_inicio)}{atividadeSelecionada.data_fim ? ` – ${formatHora(atividadeSelecionada.data_fim)}` : ''}
              </div>
            )}
            {atividadeSelecionada.descricao && (
              <div style={{ fontSize: 13, color: '#444', marginTop: 8, padding: '10px', background: '#F7F6F3', borderRadius: 10, lineHeight: 1.6 }}>
                {atividadeSelecionada.descricao}
              </div>
            )}
            {atividadeSelecionada.link && (
              <a href={atividadeSelecionada.link} target="_blank" rel="noopener noreferrer" style={{ display: 'block', marginTop: 10, color: '#2563EB', fontSize: 13, textDecoration: 'none' }}>
                🔗 Abrir link
              </a>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              {/* Botão apagar — só para quem criou ou coordenador */}
              {(perfil?.papel === 'coordenador' || atividadeSelecionada.criado_por === 'aluno') && (
                <button onClick={async () => {
                  if (!confirm('Apagar esta atividade?')) return
                  // Para recorrentes, pergunta se apaga só esta ou todas
                  const id = atividadeSelecionada.id?.split('_')[0]
                  await dbDelete('atividades', { id: `eq.${id}` })
                  setAtividades(prev => prev.filter(a => a.id !== id))
                  setAtividadeSelecionada(null)
                }} style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid #DC2626', background: 'white', color: '#DC2626', fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontWeight: 500 }}>
                  🗑 Apagar
                </button>
              )}
              <button onClick={() => setAtividadeSelecionada(null)} style={{ flex: 1, padding: 10, borderRadius: 10, border: 'none', background: '#F1F5F9', color: '#666', fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      <Nav />
    </div>
  )
}

// ========== VIEW DIA ==========
function ViewDia({ data, atividades, onSelect, isAluno, perfil, onDelete }: any) {
  const horas = Array.from({ length: 17 }, (_, i) => i + 6) // 6h às 22h

  return (
    <div>
      {atividades.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📅</div>
          <div>Nenhuma atividade neste dia</div>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          {horas.map(h => {
            const atividadesHora = atividades.filter(a => new Date(a.data_inicio).getHours() === h)
            return (
              <div key={h} style={{ display: 'flex', gap: 10, minHeight: 50, borderTop: '0.5px solid rgba(0,0,0,0.06)', paddingTop: 4, paddingBottom: 4 }}>
                <div style={{ width: 36, fontSize: 10, color: '#bbb', flexShrink: 0, paddingTop: 2 }}>{String(h).padStart(2,'0')}:00</div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {atividadesHora.map(a => {
                    const { bg, text } = corAtividade(a)
                    const canDelete = isAluno && a.criado_por === 'aluno'
                    return (
                      <div key={a.id} onClick={() => onSelect(a)} style={{ background: bg, color: text, borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>{a.titulo}</div>
                        <div style={{ fontSize: 10, opacity: 0.8 }}>
                          {formatHora(a.data_inicio)}{a.data_fim ? ` – ${formatHora(a.data_fim)}` : ''}
                          {a.materia ? ` · ${a.materia}` : ''}
                          {a.professor ? ` · ${a.professor}` : ''}
                        </div>
                        {canDelete && (
                          <button onClick={async e => { e.stopPropagation(); await dbDelete('atividades', { id: `eq.${a.id}` }); onDelete(a.id) }}
                            style={{ background: 'none', border: 'none', color: text, opacity: 0.7, cursor: 'pointer', fontSize: 12, padding: 0, marginTop: 2 }}>
                            ✕ excluir
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}


// ========== VIEW SEMANA ==========
function ViewSemana({ dataAtual, atividadesExpandidas, onSelect, onSelectDia }: any) {
  const hoje = new Date()
  
  // Calcula início da semana (domingo)
  const base = new Date(dataAtual)
  base.setDate(dataAtual.getDate() - dataAtual.getDay())
  base.setHours(0, 0, 0, 0)

  const dias: Date[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    dias.push(d)
  }

  const DIAS_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

  function atividadesDoDia(data: Date) {
    return (atividadesExpandidas || []).filter((a: any) => {
      const d = new Date(a.data_inicio)
      return d.getDate() === data.getDate() &&
        d.getMonth() === data.getMonth() &&
        d.getFullYear() === data.getFullYear()
    }).sort((a: any, b: any) => new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime())
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 8 }}>
        {dias.map((d, i) => {
          const isHoje = d.getDate() === hoje.getDate() && d.getMonth() === hoje.getMonth() && d.getFullYear() === hoje.getFullYear()
          return (
            <div key={i} onClick={() => onSelectDia(d)} style={{ textAlign: 'center', cursor: 'pointer', padding: '6px 2px', borderRadius: 8, background: isHoje ? '#EFF6FF' : 'transparent' }}>
              <div style={{ fontSize: 10, color: isHoje ? '#2563EB' : '#999' }}>{DIAS_CURTO[i]}</div>
              <div style={{ fontSize: 16, fontWeight: isHoje ? 700 : 400, color: isHoje ? '#2563EB' : '#1a1a1a' }}>{d.getDate()}</div>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {dias.map((d, i) => {
          const ativs = atividadesDoDia(d)
          const isHoje = d.getDate() === hoje.getDate() && d.getMonth() === hoje.getMonth() && d.getFullYear() === hoje.getFullYear()
          return (
            <div key={i} style={{ minHeight: 120, borderRadius: 8, border: '1px solid ' + (isHoje ? '#2563EB' : 'rgba(0,0,0,0.06)'), padding: 4, background: isHoje ? '#FAFAFE' : 'white' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {ativs.map((a: any) => {
                  const cores = corAtividade(a)
                  return (
                    <div key={a.id} onClick={() => onSelect(a)} style={{ background: cores.bg, borderRadius: 5, padding: '4px 6px', cursor: 'pointer' }}>
                      <div style={{ fontSize: 9, color: cores.text, fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                        {formatHora(a.data_inicio)} {a.titulo}
                      </div>
                      {a.materia && <div style={{ fontSize: 8, color: cores.text, opacity: 0.8 }}>{a.materia}</div>}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}


// ========== VIEW MÊS ==========
function ViewMes({ dataAtual, atividadesExpandidas, onSelectDia }: any) {
  const ano = dataAtual.getFullYear()
  const mes = dataAtual.getMonth()
  const primeiroDia = new Date(ano, mes, 1).getDay()
  const diasNoMes = new Date(ano, mes + 1, 0).getDate()
  const hoje = new Date()

  const celulas = Array.from({ length: primeiroDia + diasNoMes }, (_, i) =>
    i < primeiroDia ? null : i - primeiroDia + 1
  )

  function atividadesDia(dia: number) {
    return atividadesExpandidas.filter(a => {
      const d = new Date(a.data_inicio)
      return d.getDate() === dia && d.getMonth() === mes && d.getFullYear() === ano
    })
  }

  return (
    <div>
      {/* Header dos dias */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
        {['D','S','T','Q','Q','S','S'].map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 10, color: '#999', padding: '4px 0' }}>{d}</div>
        ))}
      </div>
      {/* Grade */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {celulas.map((dia, i) => {
          if (!dia) return <div key={i} />
          const ativs = atividadesDia(dia)
          const isHoje = hoje.getDate() === dia && hoje.getMonth() === mes && hoje.getFullYear() === ano
          return (
            <div key={i} onClick={() => onSelectDia(new Date(ano, mes, dia))} style={{
              minHeight: 52, borderRadius: 8, padding: '4px 3px',
              background: isHoje ? '#EFF6FF' : 'white',
              border: `0.5px solid ${isHoje ? '#2563EB' : 'rgba(0,0,0,0.06)'}`,
              cursor: 'pointer'
            }}>
              <div style={{ fontSize: 11, fontWeight: isHoje ? 700 : 400, color: isHoje ? '#2563EB' : '#333', textAlign: 'center', marginBottom: 2 }}>{dia}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {ativs.slice(0, 2).map((a: any) => {
                  const { bg, text } = corAtividade(a)
                  return (
                    <div key={a.id} style={{ background: bg, borderRadius: 3, padding: '1px 4px', marginBottom: 1 }}>
                      <div style={{ fontSize: 8, color: text, fontWeight: 500, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                        {a.titulo}
                      </div>
                    </div>
                  )
                })}
                {ativs.length > 2 && <div style={{ fontSize: 8, color: '#999', textAlign: 'center' }}>+{ativs.length - 2}</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ========== VIEW ANO ==========
function ViewAno({ ano, atividadesExpandidas, onSelectMes }: any) {
  const MESES_CURTO = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
      {MESES_CURTO.map((m, mi) => {
        const atividsMes = atividadesExpandidas.filter(a => {
          const d = new Date(a.data_inicio)
          return d.getMonth() === mi && d.getFullYear() === ano
        })
        const tipos = [...new Set(atividsMes.map((a: any) => a.tipo))]
        const hoje = new Date()
        const isMesAtual = hoje.getMonth() === mi && hoje.getFullYear() === ano
        return (
          <div key={mi} onClick={() => onSelectMes(mi)} className="card" style={{
            cursor: 'pointer', textAlign: 'center', padding: '12px 8px',
            border: isMesAtual ? '1.5px solid #2563EB' : '0.5px solid rgba(0,0,0,0.08)',
            background: isMesAtual ? '#EFF6FF' : 'white'
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: isMesAtual ? '#2563EB' : '#1a1a1a', marginBottom: 6 }}>{m}</div>
            <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>{atividsMes.length} ativ.</div>
            <div style={{ display: 'flex', gap: 3, justifyContent: 'center', flexWrap: 'wrap' }}>
              {tipos.slice(0, 4).map((t: any) => {
                const { bg } = corAtividade({ tipo: t })
                return <div key={t} style={{ width: 8, height: 8, borderRadius: '50%', background: bg }} />
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
