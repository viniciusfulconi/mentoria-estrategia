'use client'
import { useEffect, useMemo, useState } from 'react'
import { dbQuery, dbQueryAll, dbInsert, dbUpsert, dbUpdate } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Nav from '@/components/Nav'
import {
  calcularPrioridade, montarBlocos, distribuir, formatarMinutos,
  type Nivel, type TipoTarefa, type ItemMapa,
} from '@/lib/mapa-revisao'
import { ArrowLeft, AlertTriangle, Check, Send } from 'lucide-react'

type Materia = { id: string; nome: string; ordem: number }
type Topico  = { id: string; nome: string; materia_id: string; ordem: number }
type Item = ItemMapa & { topico_id: string; comentario: string | null; link: string | null; prioridade?: number | null }

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const COR_PRIO: Record<number, string> = { 1: '#dc2626', 2: '#ea580c', 3: '#ca8a04' }
const hojeISO = () => new Date().toISOString().slice(0, 10)

export default function MapaDetalhe() {
  const router = useRouter()
  const { perfil } = useAuth()
  const { id } = useParams<{ id: string }>()

  const [mapa, setMapa] = useState<any>(null)
  const [materias, setMaterias] = useState<Materia[]>([])
  const [topicos, setTopicos] = useState<Topico[]>([])
  const [itens, setItens] = useState<Record<string, Item>>({})
  const [etapa, setEtapa] = useState<1 | 2 | 3>(1)
  const [materiaSel, setMateriaSel] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [progresso, setProgresso] = useState<Record<string, string>>({})   // tarefa_id → status
  const [erro, setErro] = useState('')

  // Janela de distribuição
  const [dataInicio, setDataInicio] = useState(hojeISO())
  const [dataFim, setDataFim] = useState('')
  const [horaInicio, setHoraInicio] = useState('14:00')
  const [horasSemana, setHorasSemana] = useState<number[]>([0, 2, 2, 2, 2, 2, 0])

  useEffect(() => {
    if (!perfil) return
    if (!['coordenador', 'direcao', 'mentor'].includes(perfil.papel)) { router.replace('/'); return }

    Promise.all([
      dbQuery('mapas_revisao', { id: `eq.${id}`, limit: '1' }),
      dbQuery<Materia>('arvore_materias', { vertical: 'eq.Medicina', order: 'ordem.asc' }, 'id,nome,ordem'),
      dbQueryAll<Topico>('arvore_topicos', { vertical: 'eq.Medicina', order: 'ordem.asc' }, 'id,nome,materia_id,ordem'),
      dbQueryAll<any>('mapas_revisao_itens', { mapa_id: `eq.${id}` }),
    ]).then(([{ data: m }, { data: mats }, { data: tops }, { data: its }]) => {
      const mp = m?.[0]
      if (!mp) { setErro('Mapa não encontrado.'); setCarregando(false); return }
      setMapa(mp)
      if (mp.data_inicio) setDataInicio(mp.data_inicio)
      if (mp.data_fim) setDataFim(mp.data_fim)
      if (mp.hora_inicio) setHoraInicio(String(mp.hora_inicio).slice(0, 5))
      if (Array.isArray(mp.horas_semana)) setHorasSemana(mp.horas_semana.map(Number))
      setMaterias(mats || [])
      setTopicos(tops || [])
      const mapaItens: Record<string, Item> = {}
      ;(its || []).forEach((x: any) => { mapaItens[x.topico_id] = x })
      setItens(mapaItens)
      setMateriaSel(mats?.[0]?.id || '')
      setCarregando(false)

      // Mapa já enviado: puxa o cumprimento das tarefas que ele gerou.
      if (mp.status === 'enviado') {
        const ids = (its || []).flatMap((x: any) => [x.tarefa_teoria_id, x.tarefa_lista_id]).filter(Boolean)
        if (ids.length) {
          dbQueryAll<any>('tarefas_alunos', {
            tarefa_id: `in.(${ids.join(',')})`, aluno_id: `eq.${mp.aluno_id}`,
          }, 'tarefa_id,status').then(({ data }) => {
            const st: Record<string, string> = {}
            ;(data || []).forEach((r: any) => { st[r.tarefa_id] = r.status })
            setProgresso(st)
          })
        }
      }
    })
  }, [perfil, id])

  const bloqueado = mapa?.status === 'enviado'

  /** Grava (ou cria) o item daquele tópico. */
  async function salvarItem(topico: Topico, patch: Partial<Item>) {
    if (bloqueado) return
    const materia = materias.find(m => m.id === topico.materia_id)
    const atual = itens[topico.id]
    const item: Item = {
      id: atual?.id || (globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random())),
      topico_id: topico.id,
      materia_nome: materia?.nome || '',
      topico_nome: topico.nome,
      incidencia: atual?.incidencia ?? null,
      dificuldade: atual?.dificuldade ?? null,
      incluir: atual?.incluir ?? true,
      tipo: atual?.tipo ?? 'ambos',
      comentario: atual?.comentario ?? null,
      link: atual?.link ?? null,
      minutos_teoria: atual?.minutos_teoria ?? 45,
      minutos_lista: atual?.minutos_lista ?? 60,
      ...patch,
    }
    item.prioridade = calcularPrioridade(item.incidencia, item.dificuldade) as any
    setItens(p => ({ ...p, [topico.id]: item }))
    const { error } = await dbUpsert('mapas_revisao_itens', { ...item, mapa_id: id }, 'mapa_id,topico_id')
    if (error) setErro(error)
  }

  const geradores = useMemo(
    () => Object.values(itens).filter(i => calcularPrioridade(i.incidencia, i.dificuldade) !== null),
    [itens],
  )
  const incluidos = geradores.filter(i => i.incluir)

  const plano = useMemo(() => {
    const blocos = montarBlocos(incluidos as ItemMapa[])
    return distribuir(blocos, { dataInicio, dataFim, horaInicio, horasSemana })
  }, [incluidos, dataInicio, dataFim, horaInicio, horasSemana])

  async function salvarJanela() {
    if (bloqueado) return
    await dbUpdate('mapas_revisao', { id: `eq.${id}` }, {
      data_inicio: dataInicio || null, data_fim: dataFim || null,
      hora_inicio: horaInicio, horas_semana: horasSemana, updated_at: new Date().toISOString(),
    })
  }

  async function enviar() {
    if (enviando || bloqueado) return
    if (!dataFim) { setErro('Defina a data de término antes de enviar.'); return }
    if (plano.agendados.length === 0) { setErro('Nenhuma tarefa foi distribuída.'); return }
    setEnviando(true); setErro('')

    const porItemId = new Map(Object.values(itens).map(i => [i.id, i]))
    const linhas = plano.agendados.map(b => ({
      criado_por_id: perfil?.id ?? null,
      criado_por_papel: perfil?.papel ?? null,
      criado_por_nome: perfil?.nome ?? null,
      materia: b.materia,
      tipo: b.tipo,                         // 'teoria' | 'lista'
      // A tarefa só guarda a matéria, então o tópico vai no comentário —
      // senão o aluno recebe "Biologia · Teoria" sem saber o que revisar.
      link: b.tipo === 'lista' ? (porItemId.get(b.itemId)?.link || null) : null,
      comentario: [b.topico, porItemId.get(b.itemId)?.comentario].filter(Boolean).join(' — '),
      modo_prazo: 'dia',
      data: b.data,
      hora_inicio: b.hora_inicio,
      hora_fim: b.hora_fim,
      vertical: 'Medicina',
    }))

    const { data: criadas, error } = await dbInsert('tarefas', linhas, true)
    if (error || !criadas) { setErro(error || 'Falha ao criar as tarefas.'); setEnviando(false); return }

    const vinculos = criadas.map((t: any) => ({ tarefa_id: t.id, aluno_id: mapa.aluno_id }))
    const { error: e2 } = await dbInsert('tarefas_alunos', vinculos)
    if (e2) { setErro(e2); setEnviando(false); return }

    // Rastro: liga cada item às tarefas que ele gerou
    await Promise.all(plano.agendados.map((b, k) => {
      const campo = b.tipo === 'teoria' ? 'tarefa_teoria_id' : 'tarefa_lista_id'
      return dbUpdate('mapas_revisao_itens', { id: `eq.${b.itemId}` }, { [campo]: criadas[k].id })
    }))

    await dbInsert('notificacoes', [{
      aluno_id: mapa.aluno_id,
      tipo: 'tarefa',
      titulo: 'Novo plano de revisão',
      mensagem: `${perfil?.nome} montou ${criadas.length} tarefa(s) de revisão para você. Confira em Tarefas.`,
    }]).catch(() => {})

    await dbUpdate('mapas_revisao', { id: `eq.${id}` }, {
      status: 'enviado', enviado_em: new Date().toISOString(),
      data_inicio: dataInicio, data_fim: dataFim, hora_inicio: horaInicio, horas_semana: horasSemana,
    })
    router.push('/med/mapa')
  }

  if (carregando) return (<><Nav /><div style={{ padding: 40, textAlign: 'center', color: 'var(--text-hint)' }}>Carregando…</div></>)

  const topicosDaMateria = topicos.filter(t => t.materia_id === materiaSel)

  return (
    <div style={{ paddingBottom: 100 }}>
      <Nav />

      <div style={{
        background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '14px 20px',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.push('/med/mapa')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <ArrowLeft size={19} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{mapa?.aluno_nome || 'Aluno'}</div>
            <div style={{ fontSize: 11, color: '#999' }}>
              {bloqueado ? 'Mapa enviado — somente leitura' : 'Mapa de revisão · rascunho'}
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>
            <b style={{ color: 'var(--purple-dark)', fontSize: 15 }}>{incluidos.length}</b> geram tarefa
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          {([1, 2, 3] as const).map(n => (
            <button key={n} onClick={() => { if (n === 3) salvarJanela(); setEtapa(n) }} style={{
              flex: 1, padding: '7px 4px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: '1px solid ' + (etapa === n ? 'var(--purple)' : 'var(--border)'),
              background: etapa === n ? 'var(--purple-light)' : 'white',
              color: etapa === n ? 'var(--purple-dark)' : 'var(--text-muted)',
            }}>
              {n}. {n === 1 ? 'Diagnóstico' : n === 2 ? 'Tarefas' : 'Distribuição'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: 16, maxWidth: 820, margin: '0 auto' }}>
        {erro && (
          <div style={{ background: 'var(--red-light)', color: '#991b1b', padding: '10px 13px', borderRadius: 10, fontSize: 13, marginBottom: 12 }}>
            {erro}
          </div>
        )}

        {/* ─────────── ETAPA 1 — DIAGNÓSTICO ─────────── */}
        {etapa === 1 && (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
              Para cada tópico, marque a <b>incidência</b> no vestibular do aluno e a <b>dificuldade</b> dele.
              Gera tarefa quem tem dificuldade alta, ou dificuldade média em tópico de incidência alta ou média.
              O que você não marcar fica de fora.
            </p>

            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 10 }}>
              {materias.map(m => {
                const n = topicos.filter(t => t.materia_id === m.id)
                  .filter(t => itens[t.id] && calcularPrioridade(itens[t.id].incidencia, itens[t.id].dificuldade) !== null).length
                return (
                  <button key={m.id} onClick={() => setMateriaSel(m.id)} style={{
                    flex: 'none', padding: '7px 12px', borderRadius: 20, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                    border: '1px solid ' + (materiaSel === m.id ? 'var(--purple)' : 'var(--border)'),
                    background: materiaSel === m.id ? 'var(--purple)' : 'white',
                    color: materiaSel === m.id ? 'white' : 'var(--text-muted)',
                  }}>
                    {m.nome}{n > 0 && <span style={{ opacity: 0.85 }}> · {n}</span>}
                  </button>
                )
              })}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {topicosDaMateria.map(t => {
                const it = itens[t.id]
                const p = calcularPrioridade(it?.incidencia, it?.dificuldade)
                return (
                  <div key={t.id} style={{
                    background: 'white', border: '1px solid ' + (p ? 'var(--purple)' : 'var(--border)'),
                    borderRadius: 11, padding: '10px 12px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{t.nome}</span>
                      {p && (
                        <span style={{
                          fontSize: 10.5, fontWeight: 700, color: 'white', background: COR_PRIO[p],
                          padding: '2px 7px', borderRadius: 20,
                        }}>P{p}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                      {(['incidencia', 'dificuldade'] as const).map(campo => (
                        <div key={campo} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontSize: 10.5, color: 'var(--text-hint)', textTransform: 'uppercase', letterSpacing: .4, minWidth: 64 }}>
                            {campo === 'incidencia' ? 'Incidência' : 'Dificuldade'}
                          </span>
                          {(['alta', 'media', 'baixa'] as Nivel[]).map(n => (
                            <button key={n} disabled={bloqueado} onClick={() => salvarItem(t, { [campo]: it?.[campo] === n ? null : n } as any)} style={{
                              padding: '4px 9px', borderRadius: 7, fontSize: 11.5, fontWeight: 600,
                              cursor: bloqueado ? 'default' : 'pointer',
                              border: '1px solid ' + (it?.[campo] === n ? 'var(--navy)' : 'var(--border)'),
                              background: it?.[campo] === n ? 'var(--navy)' : 'white',
                              color: it?.[campo] === n ? 'white' : 'var(--text-muted)',
                            }}>
                              {n === 'alta' ? 'Alta' : n === 'media' ? 'Média' : 'Baixa'}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* ─────────── ETAPA 2 — TAREFAS ─────────── */}
        {etapa === 2 && (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
              Ajuste o que o aluno deve fazer em cada tópico antes de mandar. Nada é enviado nesta etapa.
            </p>
            {geradores.length === 0 ? (
              <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: 28, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
                Nenhum tópico gera tarefa ainda. Volte ao diagnóstico.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {geradores
                  .sort((a, b) => (calcularPrioridade(a.incidencia, a.dificuldade)! - calcularPrioridade(b.incidencia, b.dificuldade)!) || a.materia_nome.localeCompare(b.materia_nome))
                  .map(it => {
                    const t = topicos.find(x => x.id === it.topico_id)!
                    const p = calcularPrioridade(it.incidencia, it.dificuldade)!
                    return (
                      <div key={it.topico_id} style={{
                        background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px',
                        opacity: it.incluir ? 1 : 0.5,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: 'white', background: COR_PRIO[p], padding: '2px 7px', borderRadius: 20 }}>P{p}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{it.topico_nome}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>{it.materia_nome}</div>
                          </div>
                          <button disabled={bloqueado} onClick={() => salvarItem(t, { incluir: !it.incluir })} style={{
                            fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 7, cursor: 'pointer',
                            border: '1px solid var(--border)', background: 'white', color: 'var(--text-muted)',
                          }}>
                            {it.incluir ? 'Remover' : 'Incluir'}
                          </button>
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                          {(['teoria', 'lista', 'ambos'] as TipoTarefa[]).map(tp => (
                            <button key={tp} disabled={bloqueado} onClick={() => salvarItem(t, { tipo: tp })} style={{
                              padding: '5px 11px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                              border: '1px solid ' + (it.tipo === tp ? 'var(--purple)' : 'var(--border)'),
                              background: it.tipo === tp ? 'var(--purple-light)' : 'white',
                              color: it.tipo === tp ? 'var(--purple-dark)' : 'var(--text-muted)',
                            }}>
                              {tp === 'teoria' ? 'Revisão teórica' : tp === 'lista' ? 'Lista' : 'Os dois'}
                            </button>
                          ))}
                          {(it.tipo === 'teoria' || it.tipo === 'ambos') && (
                            <label style={{ fontSize: 11.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                              Teoria
                              <input type="number" min={10} step={5} value={it.minutos_teoria} disabled={bloqueado}
                                onChange={e => salvarItem(t, { minutos_teoria: Number(e.target.value) })}
                                style={{ width: 58, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border-strong)', fontSize: 12 }} />
                              min
                            </label>
                          )}
                          {(it.tipo === 'lista' || it.tipo === 'ambos') && (
                            <label style={{ fontSize: 11.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                              Lista
                              <input type="number" min={10} step={5} value={it.minutos_lista} disabled={bloqueado}
                                onChange={e => salvarItem(t, { minutos_lista: Number(e.target.value) })}
                                style={{ width: 58, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border-strong)', fontSize: 12 }} />
                              min
                            </label>
                          )}
                        </div>

                        <input placeholder="Comentário para o aluno (opcional)" defaultValue={it.comentario || ''} disabled={bloqueado}
                          onBlur={e => salvarItem(t, { comentario: e.target.value || null })}
                          style={{ width: '100%', marginTop: 8, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5 }} />
                        {(it.tipo === 'lista' || it.tipo === 'ambos') && (
                          <input placeholder="Link da lista (opcional)" defaultValue={it.link || ''} disabled={bloqueado}
                            onBlur={e => salvarItem(t, { link: e.target.value || null })}
                            style={{ width: '100%', marginTop: 6, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5 }} />
                        )}
                      </div>
                    )
                  })}
              </div>
            )}
          </>
        )}

        {/* ─────────── ETAPA 3 — DISTRIBUIÇÃO ─────────── */}
        {etapa === 3 && (
          <>
            {bloqueado && (() => {
              const ids = Object.keys(progresso)
              const feitas = ids.filter(k => progresso[k] === 'cumprida').length
              const pct = ids.length ? Math.round((feitas / ids.length) * 100) : 0
              return (
                <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 9 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Progresso do aluno</span>
                    <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                      <b style={{ color: 'var(--teal-dark)', fontSize: 15 }}>{feitas}</b> de {ids.length} cumpridas
                    </span>
                  </div>
                  <div style={{ height: 8, borderRadius: 20, background: 'var(--bg)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: 'var(--teal)', borderRadius: 20, transition: 'width .3s' }} />
                  </div>
                  {ids.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--text-hint)', marginTop: 8 }}>
                      Nenhuma tarefa vinculada a este mapa.
                    </div>
                  )}
                </div>
              )
            })()}

            <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 12 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                <label style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                  Início<br />
                  <input type="date" value={dataInicio} disabled={bloqueado} onChange={e => setDataInicio(e.target.value)} onBlur={salvarJanela}
                    style={{ marginTop: 3, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border-strong)', fontSize: 13 }} />
                </label>
                <label style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                  Término<br />
                  <input type="date" value={dataFim} disabled={bloqueado} onChange={e => setDataFim(e.target.value)} onBlur={salvarJanela}
                    style={{ marginTop: 3, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border-strong)', fontSize: 13 }} />
                </label>
                <label style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                  Começa às<br />
                  <input type="time" value={horaInicio} disabled={bloqueado} onChange={e => setHoraInicio(e.target.value)} onBlur={salvarJanela}
                    style={{ marginTop: 3, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border-strong)', fontSize: 13 }} />
                </label>
              </div>

              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 6 }}>Horas livres do aluno por dia</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {DIAS.map((d, k) => (
                  <label key={d} style={{ textAlign: 'center', fontSize: 10.5, color: 'var(--text-hint)' }}>
                    {d}<br />
                    <input type="number" min={0} max={16} step={0.5} value={horasSemana[k]} disabled={bloqueado}
                      onChange={e => setHorasSemana(h => h.map((v, i) => i === k ? Number(e.target.value) : v))}
                      onBlur={salvarJanela}
                      style={{ width: 52, marginTop: 3, padding: '6px 4px', borderRadius: 7, border: '1px solid var(--border-strong)', fontSize: 13, textAlign: 'center' }} />
                  </label>
                ))}
              </div>
            </div>

            {plano.sobra.length > 0 && (
              <div style={{
                background: 'var(--amber-light)', border: '1px solid #fbbf24', borderRadius: 12,
                padding: '12px 14px', marginBottom: 12, display: 'flex', gap: 10,
              }}>
                <AlertTriangle size={17} color="#92400e" style={{ flex: 'none', marginTop: 1 }} />
                <div style={{ fontSize: 12.5, color: '#78350f', lineHeight: 1.5 }}>
                  <b>{plano.sobra.length} tarefa(s) não couberam</b> ({formatarMinutos(plano.minutosSobra)} de estudo).
                  Estique o período, aumente as horas livres, ou volte à etapa 2 e remova as de menor prioridade.
                  Elas <b>não serão enviadas</b> como estão.
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12, fontSize: 12, color: 'var(--text-muted)' }}>
              <span>Capacidade <b>{formatarMinutos(plano.minutosCapacidade)}</b></span>
              <span>· Agendado <b>{formatarMinutos(plano.minutosAgendados)}</b></span>
              <span>· {plano.agendados.length} tarefa(s)</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(plano.agendados.reduce((acc: Record<string, typeof plano.agendados>, b) => {
                (acc[b.data] ||= []).push(b); return acc
              }, {})).map(([dia, bs]) => (
                <div key={dia} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: '11px 13px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 7 }}>
                    {DIAS[new Date(dia + 'T12:00:00').getDay()]} · {new Date(dia + 'T12:00:00').toLocaleDateString('pt-BR')}
                  </div>
                  {bs.map((b, k) => (
                    <div key={k} style={{ display: 'flex', gap: 9, alignItems: 'baseline', fontSize: 12.5, padding: '3px 0' }}>
                      <span style={{ color: 'var(--text-hint)', fontVariantNumeric: 'tabular-nums', flex: 'none' }}>
                        {b.hora_inicio}–{b.hora_fim}
                      </span>
                      <span style={{ flex: 1 }}>
                        <b>{b.materia}</b> · {b.topico}
                        {(() => {
                          const it = Object.values(itens).find(i => i.id === b.itemId) as any
                          const tid = b.tipo === 'teoria' ? it?.tarefa_teoria_id : it?.tarefa_lista_id
                          return tid && progresso[tid] === 'cumprida'
                            ? <Check size={13} color="var(--teal)" style={{ marginLeft: 6, verticalAlign: -2 }} />
                            : null
                        })()}
                      </span>
                      <span style={{
                        flex: 'none', fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 20,
                        background: b.tipo === 'teoria' ? 'var(--navy-light)' : 'var(--purple-light)',
                        color: b.tipo === 'teoria' ? 'var(--navy)' : 'var(--purple-dark)',
                      }}>
                        {b.tipo === 'teoria' ? 'Teoria' : 'Lista'}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {!bloqueado && (
              <button onClick={enviar} disabled={enviando || plano.agendados.length === 0} style={{
                width: '100%', marginTop: 16, padding: '13px', borderRadius: 12, border: 'none',
                background: plano.agendados.length === 0 ? 'var(--border-strong)' : 'var(--purple)',
                color: 'white', fontSize: 14.5, fontWeight: 700,
                cursor: enviando || plano.agendados.length === 0 ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                <Send size={16} />
                {enviando ? 'Enviando…' : `Enviar ${plano.agendados.length} tarefa(s) ao aluno`}
              </button>
            )}
            {bloqueado && (
              <div style={{
                marginTop: 16, padding: 13, borderRadius: 12, background: 'var(--teal-light)', color: 'var(--teal-dark)',
                fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                <Check size={16} /> Mapa enviado — acompanhe em Tarefas
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
