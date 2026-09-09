'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { dbQuery, dbUpdate, dbDelete } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { carregarAlunos, carregarMaterias, type AlunoBasico } from '@/lib/alunos'
import Nav from '@/components/Nav'
import {
  criarRevisoes730, flattenRevisoes, stepColumn, todayISO,
  type Revisao730, type RevisaoStep,
} from '@/lib/revisao730'
import { CalendarClock, Plus, X, Trash2 } from 'lucide-react'

const fmtData = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

const COR_STEP: Record<number, { bg: string; fg: string }> = {
  7:  { bg: 'var(--purple-light)', fg: 'var(--purple-dark)' },
  15: { bg: 'var(--navy-light)',   fg: 'var(--navy)' },
  30: { bg: 'var(--amber-light)',  fg: '#92400e' },
}

export default function Revisoes() {
  const router = useRouter()
  const { perfil } = useAuth()

  const isAluno = perfil?.papel === 'aluno'
  const isStaff = perfil ? ['coordenador', 'direcao', 'mentor'].includes(perfil.papel) : false

  const [alunos, setAlunos] = useState<AlunoBasico[]>([])
  const [alunoSel, setAlunoSel] = useState('')
  const [reviews, setReviews] = useState<Revisao730[]>([])
  const [materias, setMaterias] = useState<string[]>([])
  const [carregando, setCarregando] = useState(true)
  const [modal, setModal] = useState(false)
  const [fMateria, setFMateria] = useState('')
  const [fLabel, setFLabel] = useState('')
  const [fData, setFData] = useState(todayISO())
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const alunoAtivo = isAluno ? (perfil?.aluno_id || '') : alunoSel

  useEffect(() => {
    if (!perfil) return
    if (!isAluno && !isStaff) { router.replace('/'); return }
    carregarMaterias('Medicina').then(setMaterias)
    if (isStaff) carregarAlunos('Medicina', perfil).then(a => { setAlunos(a); setCarregando(false) })
  }, [perfil])

  const carregar = useCallback(async () => {
    if (!alunoAtivo) { setReviews([]); if (isAluno) setCarregando(false); return }
    setCarregando(true)
    const { data } = await dbQuery<Revisao730>('revisoes_730', {
      aluno_id: `eq.${alunoAtivo}`, order: 'fechado_em.desc', limit: '1000',
    })
    setReviews(data || [])
    setCarregando(false)
  }, [alunoAtivo])

  useEffect(() => { carregar() }, [carregar])

  const hoje = todayISO()
  const steps = useMemo(() => flattenRevisoes(reviews), [reviews])
  const pendentes = steps.filter(s => !s.doneAt)
  const atrasadas = pendentes.filter(s => s.date < hoje)
  const doDia = pendentes.filter(s => s.date === hoje)
  const proximas = pendentes.filter(s => s.date > hoje).slice(0, 40)
  const feitas = steps.filter(s => s.doneAt).length

  async function toggleStep(s: RevisaoStep) {
    const col = stepColumn(s.step)
    const val = s.doneAt ? null : new Date().toISOString()
    const { error } = await dbUpdate('revisoes_730', { id: `eq.${s.review.id}` }, {
      [col]: val, updated_at: new Date().toISOString(),
    })
    if (error) { setErro(error); return }
    setReviews(prev => prev.map(r => (r.id === s.review.id ? { ...r, [col]: val } : r)))
  }

  async function excluirCiclo(r: Revisao730) {
    if (!window.confirm(`Remover "${r.label}" e suas 3 revisões agendadas?`)) return
    const { error } = await dbDelete('revisoes_730', { id: `eq.${r.id}` })
    if (error) { setErro(error); return }
    setReviews(prev => prev.filter(x => x.id !== r.id))
  }

  async function adicionar() {
    if (salvando) return
    if (!fMateria || !fLabel.trim()) { setErro('Preencha matéria e conteúdo.'); return }
    setSalvando(true); setErro('')
    const r = await criarRevisoes730(alunoAtivo, [{ materia: fMateria, label: fLabel.trim() }], fData)
    setSalvando(false)
    if (r.erro) { setErro(r.erro); return }
    if (r.criadas === 0) { setErro('Esse conteúdo já tem um ciclo aberto nos últimos 30 dias.'); return }
    setModal(false); setFLabel('')
    carregar()
  }

  function Lista({ titulo, items, cor }: { titulo: string; items: RevisaoStep[]; cor?: string }) {
    if (items.length === 0) return null
    return (
      <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: '13px 15px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 9, color: cor || 'inherit' }}>
          {titulo} <span style={{ fontWeight: 400, color: 'var(--text-hint)' }}>({items.length})</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {items.map(s => {
            const c = COR_STEP[s.step]
            return (
              <div key={`${s.review.id}-${s.step}`} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <button
                  onClick={() => toggleStep(s)}
                  aria-label={`Marcar revisão de ${s.step} dias de ${s.review.label}`}
                  style={{
                    flex: 'none', width: 19, height: 19, borderRadius: 6, cursor: 'pointer',
                    border: `1.5px solid ${s.doneAt ? 'var(--teal)' : 'var(--border-strong)'}`,
                    background: s.doneAt ? 'var(--teal)' : 'white',
                    color: 'white', fontSize: 12, fontWeight: 700, lineHeight: 1,
                  }}
                >
                  {s.doneAt ? '✓' : ''}
                </button>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, textDecoration: s.doneAt ? 'line-through' : 'none', color: s.doneAt ? 'var(--text-hint)' : 'inherit' }}>
                  <b>{s.review.materia}</b> · {s.review.label}
                </div>
                <span style={{ flex: 'none', fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: c.bg, color: c.fg }}>
                  {s.step}d
                </span>
                <span style={{ flex: 'none', fontSize: 11.5, color: 'var(--text-hint)', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtData(s.date)}
                </span>
                <button onClick={() => excluirCiclo(s.review)} title="Remover ciclo" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-hint)', padding: 2, display: 'flex' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div style={{ paddingBottom: 90 }}>
      <Nav />
      <div style={{
        background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px 20px',
        position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <CalendarClock size={19} color="var(--purple)" style={{ flex: 'none' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Revisões 7-15-30</div>
          <div style={{ fontSize: 11, color: '#999' }}>
            {isAluno ? 'Conteúdo fechado volta em 7, 15 e 30 dias' : 'Acompanhe as revisões dos seus alunos'}
          </div>
        </div>
        {alunoAtivo && (
          <button onClick={() => { setErro(''); setModal(true) }} style={{
            display: 'flex', alignItems: 'center', gap: 6, background: 'var(--purple)', color: 'white',
            border: 'none', padding: '9px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            <Plus size={15} /> Fechei um conteúdo
          </button>
        )}
      </div>

      <div style={{ padding: 16, maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {erro && !modal && (
          <div style={{ background: 'var(--red-light)', color: '#991b1b', padding: '10px 13px', borderRadius: 10, fontSize: 13 }}>{erro}</div>
        )}

        {isStaff && (
          <select value={alunoSel} onChange={e => setAlunoSel(e.target.value)} style={{
            padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-strong)',
            fontSize: 14, background: 'white',
          }}>
            <option value="">Escolha o aluno…</option>
            {alunos.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
        )}

        {isAluno && !perfil?.aluno_id ? (
          <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: 28, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
            Seu cadastro ainda não está vinculado — fale com seu mentor.
          </div>
        ) : carregando ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#aaa', fontSize: 13 }}>Carregando…</div>
        ) : alunoAtivo && (
          <>
            {steps.length === 0 && (
              <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: '32px 22px', textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Nenhuma revisão agendada</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55 }}>
                  Ao cumprir uma tarefa de Medicina — ou registrar aqui que fechou um conteúdo —
                  o sistema agenda revisões para 7, 15 e 30 dias depois.
                </div>
              </div>
            )}
            <Lista titulo="Atrasadas" items={atrasadas} cor="#dc2626" />
            <Lista titulo="Para hoje" items={doDia} cor="var(--purple-dark)" />
            <Lista titulo="Próximas" items={proximas} />
            {feitas > 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-hint)', textAlign: 'center' }}>
                {feitas} revisão(ões) já concluída(s)
              </div>
            )}
          </>
        )}
      </div>

      {modal && (
        <div onClick={() => setModal(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 440, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>Fechei um conteúdo</div>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={17} /></button>
            </div>
            {erro && <div style={{ background: 'var(--red-light)', color: '#991b1b', padding: '9px 12px', borderRadius: 9, fontSize: 12.5, marginBottom: 10 }}>{erro}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <select value={fMateria} onChange={e => setFMateria(e.target.value)} style={{ padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border-strong)', fontSize: 13.5, background: 'white' }}>
                <option value="">Matéria…</option>
                {materias.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <input value={fLabel} onChange={e => setFLabel(e.target.value)} placeholder="Qual conteúdo? (ex.: Genética mendeliana)"
                style={{ padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border-strong)', fontSize: 13.5 }} />
              <label style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                Fechado em<br />
                <input type="date" value={fData} max={todayISO()} onChange={e => setFData(e.target.value)}
                  style={{ marginTop: 3, padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border-strong)', fontSize: 13 }} />
              </label>
              <button onClick={adicionar} disabled={salvando} style={{
                padding: 12, borderRadius: 10, border: 'none', background: 'var(--purple)', color: 'white',
                fontSize: 14, fontWeight: 700, cursor: salvando ? 'default' : 'pointer',
              }}>
                {salvando ? 'Agendando…' : 'Agendar revisões 7-15-30'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
