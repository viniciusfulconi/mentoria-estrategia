'use client'
import { useEffect, useState, useCallback } from 'react'
import { dbQuery, dbUpdate } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Nav from '@/components/Nav'
import { X, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'

type PageTab = 'perfil' | 'simulados'

type SimuladoResumo = {
  simulado_id: string
  nome: string
  total_pontos: number
  pontos_objetiva: number
  total_respostas: number
  tipo?: string
}

const VESTIBULARES = [
  'ENEM','UERJ','UNITAU','USCS','UNIFAE','UEA','UVA','URCA','UEMA','UEMASUL','UERR',
  'USP','Unicamp','Unesp','Famema','Famerp','Unifesp','UFRGS','UFSC','UFPR','UEL',
  'UEM','UEPG','Unioeste','Unicentro','UnB','UFGD','UECE','UNEB','UEFS','UESB','UPE',
  'UFU','Unimontes','Santa Casa','Einstein','PUC-Campinas','FMABC','PUC-PR','PUC-MG','PUC-RS',
]

const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  'Ativo': { label: 'Ativo', bg: '#DCFCE7', color: '#166534' },
  'Ativo - Não optou pela mentoria': { label: 'Não optou pela mentoria', bg: '#DBEAFE', color: '#1e40af' },
  'Ativo - Sem contato': { label: 'Sem contato', bg: '#FEF9C3', color: '#854d0e' },
  'Ativo - Sem resposta': { label: 'Sem resposta', bg: '#EDE9FE', color: '#5b21b6' },
  'Inativo - Cancelou o curso': { label: 'Cancelou o curso', bg: '#FEE2E2', color: '#991b1b' },
}

type AlunoDetalhe = {
  id: string
  nome: string
  email: string
  telefone: string | null
  modalidade: 'Presencial' | 'Online' | null
  turma_id: string | null
  mentor_id: string | null
  mentor_aceite: boolean | null
  status_aluno: string
  data_nascimento: string | null
  uf: string | null
  cidade_aluno: string | null
  vestibulares_interesse: string[] | null
  vertical: string
  turmas?: { nome: string }
  mentores?: { nome: string; email?: string }
}

type FormState = {
  nome: string
  telefone: string
  modalidade: 'Presencial' | 'Online' | ''
  turma_id: string
  status_aluno: string
  data_nascimento: string
  uf: string
  cidade_aluno: string
  vestibulares_interesse: string[]
}

export default function AlunoMedDetalhe() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { perfil } = useAuth()
  const [aluno, setAluno] = useState<AlunoDetalhe | null>(null)
  const [turmas, setTurmas] = useState<any[]>([])
  const [mentoresDisp, setMentoresDisp] = useState<any[]>([])
  const [form, setForm] = useState<FormState>({
    nome: '', telefone: '', modalidade: '', turma_id: '',
    status_aluno: 'Ativo', data_nascimento: '', uf: '', cidade_aluno: '',
    vestibulares_interesse: [],
  })
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [vestOpen, setVestOpen] = useState(false)
  const [modalBloqueio, setModalBloqueio] = useState(false)
  const [modalEncaminhar, setModalEncaminhar] = useState(false)
  const [mentorSelecionado, setMentorSelecionado] = useState('')
  const [salvandoMentor, setSalvandoMentor] = useState(false)
  const [pageTab, setPageTab] = useState<PageTab>('perfil')
  const [simuladosAluno, setSimuladosAluno] = useState<SimuladoResumo[]>([])
  const [carregandoSims, setCarregandoSims] = useState(false)

  useEffect(() => {
    if (perfil && perfil.papel !== 'coordenador' && perfil.papel !== 'direcao' && perfil.papel !== 'mentor') {
      router.replace('/')
      return
    }
    carregar()
  }, [perfil, id])

  async function carregar() {
    setCarregando(true)
    const [{ data: a }, { data: t }, { data: m }] = await Promise.all([
      dbQuery<AlunoDetalhe>('alunos', { id: `eq.${id}` }, '*,turmas(nome),mentores(nome,email)'),
      dbQuery('turmas', { tipo: 'eq.Medicina', order: 'nome' }),
      dbQuery('mentores', { vertical: 'eq.Medicina', aceitando_alunos: 'eq.true', order: 'nome' }),
    ])
    if (a && a.length > 0) {
      const al = a[0]
      setAluno(al)
      setForm({
        nome: al.nome || '',
        telefone: al.telefone || '',
        modalidade: (al.modalidade as any) || '',
        turma_id: al.turma_id || '',
        status_aluno: al.status_aluno || 'Ativo',
        data_nascimento: al.data_nascimento || '',
        uf: al.uf || '',
        cidade_aluno: al.cidade_aluno || '',
        vestibulares_interesse: al.vestibulares_interesse || [],
      })
    }
    setTurmas(t || [])
    setMentoresDisp(m || [])
    setCarregando(false)
  }

  function toggleVestibular(v: string) {
    setForm(f => ({
      ...f,
      vestibulares_interesse: f.vestibulares_interesse.includes(v)
        ? f.vestibulares_interesse.filter(x => x !== v)
        : [...f.vestibulares_interesse, v],
    }))
  }

  function formatTelefone(v: string) {
    const d = v.replace(/\D/g, '').slice(0, 11)
    if (d.length <= 2) return d
    if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`
    return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
  }

  async function salvar(confirmarBloqueio = false) {
    if (!form.nome) { setErro('Nome é obrigatório.'); return }

    const vaiBloqueiar =
      form.status_aluno === 'Inativo - Cancelou o curso' &&
      aluno?.status_aluno !== 'Inativo - Cancelou o curso'

    if (vaiBloqueiar && !confirmarBloqueio) {
      setModalBloqueio(true)
      return
    }

    setSalvando(true); setErro('')

    const { error: err } = await dbUpdate('alunos', { id: `eq.${id}` }, {
      nome: form.nome,
      telefone: form.telefone || null,
      modalidade: form.modalidade || null,
      turma_id: form.turma_id || null,
      status_aluno: form.status_aluno,
      data_nascimento: form.data_nascimento || null,
      uf: form.uf || null,
      cidade_aluno: form.cidade_aluno || null,
      vestibulares_interesse: form.vestibulares_interesse.length > 0 ? form.vestibulares_interesse : null,
    })

    if (!err) {
      if (form.status_aluno === 'Inativo - Cancelou o curso') {
        await dbUpdate('perfis', { aluno_id: `eq.${id}` }, { status: 'bloqueado' })
      } else if (aluno?.status_aluno === 'Inativo - Cancelou o curso') {
        await dbUpdate('perfis', { aluno_id: `eq.${id}` }, { status: 'aprovado' })
      }
    }

    setSalvando(false)
    setModalBloqueio(false)
    if (err) { setErro(err) }
    else { setSucesso('Dados salvos!'); await carregar(); setTimeout(() => setSucesso(''), 3000) }
  }

  async function carregarSimulados() {
    setCarregandoSims(true)
    const [{ data: scores }, { data: sims }] = await Promise.all([
      dbQuery('simulado_scores', { aluno_id: `eq.${id}` }, 'simulado_id,total_pontos,pontos_objetiva,total_respostas'),
      dbQuery('simulados_med', {}, 'id,nome,simulado_templates(tipo)'),
    ])
    const simMap: Record<string, any> = {}
    ;(sims || []).forEach((s: any) => { simMap[s.id] = s })
    const lista: SimuladoResumo[] = (scores || []).map((sc: any) => {
      const s = simMap[sc.simulado_id]
      return {
        simulado_id: sc.simulado_id,
        nome: s?.nome || sc.simulado_id,
        total_pontos: sc.total_pontos,
        pontos_objetiva: sc.pontos_objetiva,
        total_respostas: sc.total_respostas,
        tipo: s?.simulado_templates?.tipo,
      }
    })
    setSimuladosAluno(lista)
    setCarregandoSims(false)
  }

  async function encaminhar() {
    if (!mentorSelecionado) return
    setSalvandoMentor(true)
    await dbUpdate('alunos', { id: `eq.${id}` }, { mentor_id: mentorSelecionado, mentor_aceite: null })
    setSalvandoMentor(false)
    setModalEncaminhar(false)
    setMentorSelecionado('')
    await carregar()
  }

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    border: '1px solid rgba(0,0,0,0.12)', fontSize: 14,
    background: 'white', outline: 'none', boxSizing: 'border-box' as const,
    fontFamily: 'DM Sans, sans-serif', color: '#1a1a1a',
  }

  const disabledStyle = {
    ...inputStyle,
    background: '#F8FAFC', color: '#888', cursor: 'not-allowed',
  }

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <label style={{ fontSize: 12, fontWeight: 500, color: '#666', display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  )

  if (carregando) return (
    <div style={{ paddingBottom: 80 }}>
      <Nav />
      <div style={{ textAlign: 'center', padding: 60, color: '#aaa', fontSize: 13 }}>Carregando...</div>
    </div>
  )

  if (!aluno) return (
    <div style={{ paddingBottom: 80 }}>
      <Nav />
      <div style={{ textAlign: 'center', padding: 60, color: '#aaa', fontSize: 13 }}>Aluno não encontrado.</div>
    </div>
  )

  const cfg = STATUS_CONFIG[aluno.status_aluno] || STATUS_CONFIG['Ativo']
  const semMentor = !aluno.mentor_id
  const pendente = aluno.mentor_id && aluno.mentor_aceite === null
  const comMentor = aluno.mentor_aceite === true

  return (
    <div style={{ paddingBottom: 80 }}>
      <Nav />

      {/* Header */}
      <div style={{
        background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)',
        padding: '16px 20px', position: 'sticky', top: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa' }}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {aluno.nome}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3 }}>
            <span style={{
              background: cfg.bg, color: cfg.color,
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
            }}>
              {cfg.label}
            </span>
            {aluno.turmas?.nome && (
              <span style={{ fontSize: 11, color: '#999' }}>{aluno.turmas.nome}</span>
            )}
          </div>
        </div>
        {sucesso && (
          <span style={{ fontSize: 12, color: '#166534', fontWeight: 600 }}>✓ Salvo</span>
        )}
      </div>

      {/* Tab bar */}
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '0 16px', display: 'flex', gap: 0 }}>
        {([['perfil', 'Perfil'], ['simulados', 'Simulados']] as const).map(([v, l]) => (
          <button
            key={v}
            onClick={() => {
              setPageTab(v)
              if (v === 'simulados' && simuladosAluno.length === 0) carregarSimulados()
            }}
            style={{
              padding: '12px 18px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: pageTab === v ? 700 : 400,
              color: pageTab === v ? 'var(--purple)' : '#888',
              borderBottom: pageTab === v ? '2px solid var(--purple)' : '2px solid transparent',
              fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s',
            }}
          >
            {l}
          </button>
        ))}
      </div>

      {/* ── Aba Simulados ── */}
      {pageTab === 'simulados' && (
        <div style={{ padding: '16px', maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {carregandoSims ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#aaa', fontSize: 13 }}>Carregando...</div>
          ) : simuladosAluno.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#aaa', fontSize: 13 }}>
              Nenhum simulado realizado ainda.
            </div>
          ) : simuladosAluno.map(sim => {
            const pct = sim.total_respostas > 0 ? Math.round((sim.pontos_objetiva / sim.total_respostas) * 100) : 0
            const corFundo = pct >= 60 ? '#DCFCE7' : pct >= 40 ? '#FEF9C3' : '#FEE2E2'
            const corTexto = pct >= 60 ? '#166534' : pct >= 40 ? '#854d0e' : '#991b1b'
            return (
              <button
                key={sim.simulado_id}
                onClick={() => router.push(`/med/alunos/${id}/simulados/${sim.simulado_id}`)}
                style={{
                  background: 'white', borderRadius: 12, padding: '14px 16px',
                  border: '0.5px solid rgba(0,0,0,0.10)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  textAlign: 'left', fontFamily: 'DM Sans, sans-serif',
                  transition: 'box-shadow 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {sim.nome}
                  </div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                    {sim.total_respostas} questões respondidas
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <div style={{ background: corFundo, color: corTexto, fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 20 }}>
                    {sim.pontos_objetiva}/{sim.total_respostas}
                  </div>
                  <span style={{ color: '#ccc', fontSize: 18 }}>›</span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Aba Perfil ── */}
      <div style={{ padding: '20px 16px', maxWidth: 640, margin: '0 auto', display: pageTab === 'perfil' ? 'flex' : 'none', flexDirection: 'column', gap: 24 }}>

        {erro && (
          <div style={{ background: '#FEF2F2', color: '#991B1B', fontSize: 13, padding: '10px 14px', borderRadius: 10 }}>{erro}</div>
        )}

        {/* Dados pessoais */}
        <section>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
            Dados pessoais
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            <Field label="Nome completo">
              <input style={inputStyle} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} />
            </Field>

            <Field label="E-mail">
              <input style={disabledStyle} value={aluno.email} readOnly />
            </Field>

            <Field label="Celular (WhatsApp)">
              <input style={inputStyle} value={form.telefone}
                onChange={e => setForm({ ...form, telefone: formatTelefone(e.target.value) })}
                placeholder="(11) 99999-9999" />
            </Field>

            <Field label="Modalidade">
              <div style={{ display: 'flex', gap: 8 }}>
                {['Presencial', 'Online'].map(m => (
                  <button key={m} onClick={() => setForm({ ...form, modalidade: m as any })} style={{
                    flex: 1, padding: '10px', borderRadius: 10, border: '1px solid',
                    cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'DM Sans, sans-serif',
                    borderColor: form.modalidade === m ? 'var(--purple)' : 'rgba(0,0,0,0.12)',
                    background: form.modalidade === m ? 'var(--purple-light)' : 'white',
                    color: form.modalidade === m ? 'var(--purple)' : '#555',
                  }}>{m}</button>
                ))}
              </div>
            </Field>

            <Field label="Turma">
              <select style={inputStyle} value={form.turma_id} onChange={e => setForm({ ...form, turma_id: e.target.value })}>
                <option value="">Sem turma</option>
                {turmas.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </Field>

            <Field label="Status">
              <select
                style={{
                  ...inputStyle,
                  background: STATUS_CONFIG[form.status_aluno]?.bg || 'white',
                  color: STATUS_CONFIG[form.status_aluno]?.color || '#1a1a1a',
                  fontWeight: 600,
                }}
                value={form.status_aluno}
                onChange={e => setForm({ ...form, status_aluno: e.target.value })}
              >
                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </Field>

            <Field label="Data de nascimento">
              <input style={inputStyle} type="date" value={form.data_nascimento}
                onChange={e => setForm({ ...form, data_nascimento: e.target.value })} />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
              <Field label="UF">
                <select style={inputStyle} value={form.uf} onChange={e => setForm({ ...form, uf: e.target.value })}>
                  <option value="">—</option>
                  {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </Field>
              <Field label="Cidade">
                <input style={inputStyle} value={form.cidade_aluno}
                  onChange={e => setForm({ ...form, cidade_aluno: e.target.value })}
                  placeholder="Ex: São Paulo" />
              </Field>
            </div>
          </div>
        </section>

        {/* Vestibulares */}
        <section>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
            Vestibulares de interesse
          </div>
          <div style={{ border: '1px solid rgba(0,0,0,0.12)', borderRadius: 10, overflow: 'hidden' }}>
            <button
              onClick={() => setVestOpen(v => !v)}
              style={{
                width: '100%', padding: '10px 14px', background: 'white', border: 'none',
                cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontSize: 13, fontFamily: 'DM Sans, sans-serif',
                color: form.vestibulares_interesse.length ? '#1a1a1a' : '#aaa',
              }}
            >
              <span>
                {form.vestibulares_interesse.length > 0
                  ? `${form.vestibulares_interesse.length} selecionado(s)`
                  : 'Selecionar vestibulares'}
              </span>
              {vestOpen ? <ChevronUp size={16} color="#888" /> : <ChevronDown size={16} color="#888" />}
            </button>
            {vestOpen && (
              <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(0,0,0,0.08)', display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                {VESTIBULARES.map(v => (
                  <button key={v} onClick={() => toggleVestibular(v)} style={{
                    padding: '4px 10px', borderRadius: 20, border: '1px solid', cursor: 'pointer',
                    fontSize: 12, fontWeight: 500, fontFamily: 'DM Sans, sans-serif',
                    background: form.vestibulares_interesse.includes(v) ? 'var(--purple)' : 'white',
                    borderColor: form.vestibulares_interesse.includes(v) ? 'var(--purple)' : 'rgba(0,0,0,0.15)',
                    color: form.vestibulares_interesse.includes(v) ? 'white' : '#555',
                  }}>{v}</button>
                ))}
              </div>
            )}
            {form.vestibulares_interesse.length > 0 && (
              <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(0,0,0,0.06)', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {form.vestibulares_interesse.map(v => (
                  <span key={v} style={{
                    background: 'var(--purple-light)', color: 'var(--purple)',
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12,
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    {v}
                    <button onClick={() => toggleVestibular(v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
                      <X size={10} color="var(--purple)" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Mentor */}
        <section>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
            Mentor
          </div>
          <div style={{
            background: 'white', borderRadius: 12, padding: '14px 16px',
            border: '0.5px solid rgba(0,0,0,0.10)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            {semMentor ? (
              <>
                <span style={{ fontSize: 13, color: '#aaa' }}>Sem mentor atribuído</span>
                <button
                  onClick={() => { setModalEncaminhar(true); setMentorSelecionado('') }}
                  style={{
                    padding: '8px 14px', borderRadius: 8,
                    border: '1px solid var(--purple)', background: 'var(--purple-light)',
                    color: 'var(--purple)', fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                  }}
                >
                  Encaminhar
                </button>
              </>
            ) : pendente ? (
              <>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{aluno.mentores?.nome || '—'}</div>
                  <span style={{
                    background: '#FEF9C3', color: '#854d0e',
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                    display: 'inline-block', marginTop: 4,
                  }}>
                    Aguardando aceitação
                  </span>
                </div>
                <button
                  onClick={() => { setModalEncaminhar(true); setMentorSelecionado('') }}
                  style={{
                    padding: '8px 14px', borderRadius: 8,
                    border: '1px solid rgba(0,0,0,0.12)', background: 'white',
                    color: '#666', fontSize: 12, fontWeight: 500,
                    cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                  }}
                >
                  Trocar
                </button>
              </>
            ) : comMentor ? (
              <>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{aluno.mentores?.nome || '—'}</div>
                  <span style={{
                    background: '#DCFCE7', color: '#166534',
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                    display: 'inline-block', marginTop: 4,
                  }}>
                    Aceito
                  </span>
                </div>
                <button
                  onClick={() => { setModalEncaminhar(true); setMentorSelecionado('') }}
                  style={{
                    padding: '8px 14px', borderRadius: 8,
                    border: '1px solid rgba(0,0,0,0.12)', background: 'white',
                    color: '#666', fontSize: 12, fontWeight: 500,
                    cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                  }}
                >
                  Trocar
                </button>
              </>
            ) : null}
          </div>
        </section>

        {/* Salvar */}
        <button
          onClick={() => salvar(false)}
          disabled={salvando}
          style={{
            padding: 14, borderRadius: 12, border: 'none',
            background: salvando ? '#ccc' : 'var(--purple)',
            color: 'white', fontSize: 15, fontWeight: 600,
            cursor: salvando ? 'not-allowed' : 'pointer',
            fontFamily: 'DM Sans, sans-serif',
          }}
        >
          {salvando ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </div>

      {/* Modal confirmação de bloqueio */}
      {modalBloqueio && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}
          onClick={e => { if (e.target === e.currentTarget) setModalBloqueio(false) }}
        >
          <div style={{
            background: 'white', borderRadius: '20px 20px 0 0',
            width: '100%', padding: '24px 20px 32px',
          }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: '#E0E0E0', margin: '0 auto 20px' }} />
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
              <AlertTriangle size={20} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Bloquear acesso do aluno?</div>
                <div style={{ fontSize: 13, color: '#666', lineHeight: 1.6 }}>
                  Ao salvar com status <strong>Inativo – Cancelou o curso</strong>, o aluno perderá o acesso à plataforma imediatamente. Essa ação pode ser revertida mudando o status novamente.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                onClick={() => setModalBloqueio(false)}
                style={{
                  flex: 1, padding: 13, borderRadius: 12,
                  border: '1px solid rgba(0,0,0,0.12)', background: 'white',
                  fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => salvar(true)}
                style={{
                  flex: 2, padding: 13, borderRadius: 12, border: 'none',
                  background: '#ef4444', color: 'white',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                }}
              >
                Confirmar e bloquear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal encaminhar / trocar mentor */}
      {modalEncaminhar && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}
          onClick={e => { if (e.target === e.currentTarget) setModalEncaminhar(false) }}
        >
          <div style={{
            background: 'white', borderRadius: '20px 20px 0 0',
            width: '100%', padding: '20px 20px 32px',
            maxHeight: '80vh', overflowY: 'auto',
          }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: '#E0E0E0', margin: '0 auto 20px' }} />
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
              {semMentor ? 'Encaminhar aluno' : 'Trocar mentor'}
            </div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>
              Selecione o novo mentor. Ele receberá a solicitação e precisará aceitar.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {mentoresDisp.length === 0 ? (
                <div style={{ fontSize: 13, color: '#999', textAlign: 'center', padding: 20 }}>
                  Nenhum mentor disponível no momento.
                </div>
              ) : mentoresDisp.map(m => (
                <button
                  key={m.id}
                  onClick={() => setMentorSelecionado(m.id)}
                  style={{
                    padding: '12px 16px', borderRadius: 12,
                    border: `1.5px solid ${mentorSelecionado === m.id ? 'var(--purple)' : 'rgba(0,0,0,0.10)'}`,
                    background: mentorSelecionado === m.id ? 'var(--purple-light)' : 'white',
                    cursor: 'pointer', textAlign: 'left', fontFamily: 'DM Sans, sans-serif',
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600, color: mentorSelecionado === m.id ? 'var(--purple)' : '#1a1a1a' }}>
                    {m.nome}
                  </div>
                  {m.email && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{m.email}</div>}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setModalEncaminhar(false)}
                style={{
                  flex: 1, padding: 13, borderRadius: 12,
                  border: '1px solid rgba(0,0,0,0.12)', background: 'white',
                  fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={encaminhar}
                disabled={!mentorSelecionado || salvandoMentor}
                style={{
                  flex: 2, padding: 13, borderRadius: 12, border: 'none',
                  background: mentorSelecionado && !salvandoMentor ? 'var(--purple)' : '#ccc',
                  color: 'white', fontSize: 14, fontWeight: 600,
                  cursor: mentorSelecionado && !salvandoMentor ? 'pointer' : 'not-allowed',
                  fontFamily: 'DM Sans, sans-serif',
                }}
              >
                {salvandoMentor ? 'Encaminhando...' : 'Encaminhar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
