'use client'
import { useEffect, useMemo, useState } from 'react'
import { dbQuery, dbInsert, dbUpdate, getToken } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { carregarAlunos } from '@/lib/alunos'
import Nav from '@/components/Nav'
import RelatorioEnem from '@/components/enem/RelatorioEnem'
import { ENEM_AREAS, type EnemArea, type EnemAreaEntry } from '@/lib/tri/tipos'
import { ArrowLeft, Download, Send } from 'lucide-react'

const LETRAS = ['a', 'b', 'c', 'd', 'e'] as const

/** Numeração do cartão: em LC a língua escolhida vem antes das comuns. */
function linhasDaArea(entry: EnemAreaEntry, lingua: number | null): { n: number; qid: string }[] | null {
  let ids: string[]
  if (entry.area === 'LC') {
    if (lingua == null) return null
    ids = [...((lingua === 1 ? entry.espanhol : entry.ingles) ?? []), ...(entry.comuns ?? [])]
  } else {
    ids = entry.question_ids ?? []
  }
  const base = entry.base ?? 0
  return ids.map((qid, i) => ({ n: base + i + 1, qid }))
}

export default function EnemProva() {
  const router = useRouter()
  const { perfil } = useAuth()
  const { id } = useParams<{ id: string }>()

  const [prova, setProva] = useState<any>(null)
  const [tentativa, setTentativa] = useState<any>(null)
  const [respostas, setRespostas] = useState<Record<string, string>>({})
  const [lingua, setLingua] = useState<number | null>(null)
  const [alunos, setAlunos] = useState<{ id: string; nome: string }[]>([])
  const [tentativasStaff, setTentativasStaff] = useState<any[]>([])
  const [verAluno, setVerAluno] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  const isAluno = perfil?.papel === 'aluno'
  const isStaff = perfil ? ['coordenador', 'direcao', 'mentor'].includes(perfil.papel) : false

  useEffect(() => {
    if (!perfil) return
    if (!isAluno && !isStaff) { router.replace('/'); return }

    ;(async () => {
      const { data: p } = await dbQuery('enem_provas', { id: `eq.${id}`, limit: '1' })
      const pr = p?.[0]
      if (!pr) { setErro('Prova não encontrada.'); setCarregando(false); return }
      setProva(pr)

      if (isAluno && perfil.aluno_id) {
        const { data: t } = await dbQuery('enem_tentativas', {
          prova_id: `eq.${id}`, aluno_id: `eq.${perfil.aluno_id}`, limit: '1',
        })
        if (t?.[0]) {
          setTentativa(t[0])
          setRespostas(t[0].respostas || {})
          setLingua(t[0].lingua ?? null)
        }
      } else {
        // staff: quem já enviou, restrito aos alunos que o mentor acompanha
        const meus = await carregarAlunos('Medicina', perfil)
        setAlunos(meus)
        const ids = meus.map(a => a.id)
        const { data: ts } = await dbQuery('enem_tentativas', {
          prova_id: `eq.${id}`, status: 'eq.enviada',
        }, 'id,aluno_id,resultado,enviada_em')
        setTentativasStaff((ts || []).filter((t: any) => ids.includes(t.aluno_id)))
      }
      setCarregando(false)
    })()
  }, [perfil, id])

  const areas: EnemAreaEntry[] = prova?.areas || []
  const enviada = tentativa?.status === 'enviada'

  const totalMarcadas = useMemo(() => Object.keys(respostas).length, [respostas])
  const totalCartao = useMemo(
    () => areas.reduce((s, a) => s + (linhasDaArea(a, lingua ?? 0)?.length ?? 0), 0),
    [areas, lingua],
  )

  async function garantirTentativa() {
    if (tentativa) return tentativa
    const { data, error } = await dbInsert('enem_tentativas', {
      prova_id: id, aluno_id: perfil!.aluno_id, status: 'em_andamento', respostas: {}, lingua,
    }, true)
    if (error || !data?.[0]) { setErro(error || 'Não consegui abrir a prova.'); return null }
    setTentativa(data[0])
    return data[0]
  }

  async function marcar(qid: string, letra: string) {
    if (enviada) return
    const novo = { ...respostas, [qid]: respostas[qid] === letra ? '' : letra }
    if (!novo[qid]) delete novo[qid]
    setRespostas(novo)
    const t = await garantirTentativa()
    if (t) dbUpdate('enem_tentativas', { id: `eq.${t.id}` }, { respostas: novo, lingua })
  }

  async function enviar() {
    if (enviando) return
    if (lingua == null) { setErro('Escolha a língua estrangeira antes de enviar.'); return }
    if (!window.confirm(`Enviar com ${totalMarcadas} de ${totalCartao} questões marcadas? Não dá para refazer.`)) return
    setEnviando(true); setErro('')
    const t = await garantirTentativa()
    if (!t) { setEnviando(false); return }

    const r = await fetch('/api/enem/corrigir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ tentativa_id: t.id, respostas, lingua }),
    })
    const j = await r.json()
    if (!r.ok) { setErro(j.error || 'Falha ao corrigir.'); setEnviando(false); return }
    setTentativa({ ...t, status: 'enviada', resultado: j.resultado, lingua })
    setEnviando(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (carregando) return (<><Nav /><div style={{ padding: 40, textAlign: 'center', color: 'var(--text-hint)' }}>Carregando…</div></>)

  const res = tentativa?.resultado

  return (
    <div style={{ paddingBottom: 90 }}>
      <Nav />
      <div style={{
        background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '14px 20px',
        position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button onClick={() => router.push('/med/enem')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <ArrowLeft size={19} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{prova?.titulo}</div>
          <div style={{ fontSize: 11, color: '#999' }}>
            {isAluno ? (enviada ? 'Prova enviada' : `${totalMarcadas} de ${totalCartao} marcadas`) : 'Desempenho dos seus alunos'}
          </div>
        </div>
        {prova?.pdf_url && (
          <a href={prova.pdf_url} target="_blank" rel="noopener noreferrer" style={{
            display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none',
            background: 'var(--purple)', color: 'white', padding: '8px 13px', borderRadius: 10,
            fontSize: 12.5, fontWeight: 600,
          }}>
            <Download size={14} /> Caderno
          </a>
        )}
      </div>

      <div style={{ padding: 16, maxWidth: 760, margin: '0 auto' }}>
        {erro && (
          <div style={{ background: 'var(--red-light)', color: '#991b1b', padding: '10px 13px', borderRadius: 10, fontSize: 13, marginBottom: 12 }}>
            {erro}
          </div>
        )}

        {/* ═══ STAFF: lista de alunos que enviaram ═══ */}
        {isStaff && !verAluno && (
          tentativasStaff.length === 0 ? (
            <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: 30, textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 5 }}>Nenhum aluno seu enviou esta prova</div>
              <div style={{ fontSize: 13, color: '#999' }}>Assim que enviarem, o relatório aparece aqui.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tentativasStaff.map(t => {
                const nome = alunos.find(a => a.id === t.aluno_id)?.nome || 'Aluno'
                const nota = t.resultado?.nota_media_areas
                return (
                  <button key={t.id} onClick={() => setVerAluno(t.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer',
                    background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: '13px 15px',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{nome}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-hint)' }}>
                        {['LC', 'CH', 'CN', 'MT'].map(a => `${a} ${t.resultado?.areas?.[a]?.nota?.toFixed(0) ?? '—'}`).join(' · ')}
                      </div>
                    </div>
                    <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--navy)', fontVariantNumeric: 'tabular-nums' }}>
                      {nota != null ? nota.toFixed(0) : '—'}
                    </span>
                  </button>
                )
              })}
            </div>
          )
        )}

        {isStaff && verAluno && (
          <>
            <button onClick={() => setVerAluno(null)} style={{
              background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--purple-dark)',
              padding: 0, marginBottom: 12, fontWeight: 600,
            }}>
              ← voltar para a lista
            </button>
            <RelatorioEnem tentativaId={verAluno} />
          </>
        )}

        {/* ═══ ALUNO ═══ */}
        {isAluno && (
          <>
            {enviada && res && (
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', marginBottom: 16 }}>
                {ENEM_AREAS.filter(a => res.areas?.[a.key]).map(a => {
                  const r = res.areas[a.key]
                  return (
                    <div key={a.key} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: '11px 13px' }}>
                      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: .4, color: 'var(--text-hint)' }}>{a.short}</div>
                      <div style={{ fontSize: 21, fontWeight: 700, color: 'var(--navy)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
                        {r.nota.toFixed(1)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.acertos}/{r.total} acertos</div>
                    </div>
                  )
                })}
              </div>
            )}

            {enviada && tentativa && <RelatorioEnem tentativaId={tentativa.id} />}

            {!enviada && (
              <>
                <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: '13px 15px', marginBottom: 12 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>Língua estrangeira</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[{ v: 0, l: 'Inglês' }, { v: 1, l: 'Espanhol' }].map(o => (
                      <button key={o.v} onClick={() => setLingua(o.v)} style={{
                        padding: '7px 15px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        border: `1px solid ${lingua === o.v ? 'var(--purple)' : 'var(--border-strong)'}`,
                        background: lingua === o.v ? 'var(--purple)' : 'white',
                        color: lingua === o.v ? 'white' : 'var(--text-muted)',
                      }}>
                        {o.l}
                      </button>
                    ))}
                  </div>
                  {lingua == null && (
                    <div style={{ fontSize: 11.5, color: 'var(--text-hint)', marginTop: 7 }}>
                      O cartão de Linguagens só abre depois de escolher.
                    </div>
                  )}
                </div>

                {ENEM_AREAS.filter(a => areas.some(e => e.area === a.key)).map(a => {
                  const entry = areas.find(e => e.area === a.key)!
                  const linhas = linhasDaArea(entry, lingua)
                  return (
                    <div key={a.key} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: '13px 15px', marginBottom: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{a.label}</div>
                      {linhas == null ? (
                        <div style={{ fontSize: 12.5, color: 'var(--text-hint)' }}>Escolha a língua acima para liberar este cartão.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          {linhas.map(({ n, qid }) => (
                            <div key={qid} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ width: 26, textAlign: 'right', fontSize: 12, fontWeight: 700, color: 'var(--text-hint)', fontVariantNumeric: 'tabular-nums' }}>{n}</span>
                              <div style={{ display: 'flex', gap: 5 }}>
                                {LETRAS.map(letra => {
                                  const on = respostas[qid] === letra
                                  return (
                                    <button key={letra} onClick={() => marcar(qid, letra)}
                                      aria-label={`Questão ${n} alternativa ${letra.toUpperCase()}`}
                                      style={{
                                        width: 29, height: 29, borderRadius: '50%', cursor: 'pointer',
                                        border: `1.5px solid ${on ? 'var(--purple)' : 'var(--border-strong)'}`,
                                        background: on ? 'var(--purple)' : 'transparent',
                                        color: on ? '#fff' : 'var(--text-muted)', fontWeight: 700, fontSize: 11.5,
                                      }}>
                                      {letra.toUpperCase()}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}

                <button onClick={enviar} disabled={enviando || lingua == null} style={{
                  width: '100%', marginTop: 8, padding: 13, borderRadius: 12, border: 'none',
                  background: lingua == null ? 'var(--border-strong)' : 'var(--purple)',
                  color: 'white', fontSize: 14.5, fontWeight: 700,
                  cursor: enviando || lingua == null ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                  <Send size={16} /> {enviando ? 'Corrigindo…' : `Enviar cartão (${totalMarcadas}/${totalCartao})`}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
