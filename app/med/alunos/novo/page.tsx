'use client'
import { useEffect, useState, useRef } from 'react'
import { dbQuery, dbInsert } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Nav from '@/components/Nav'
import { Upload, UserPlus, X, ChevronDown, ChevronUp } from 'lucide-react'

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

type FormAluno = {
  nome: string
  email: string
  telefone: string
  modalidade: 'Presencial' | 'Online' | ''
  turma_id: string
  status_aluno: string
  data_nascimento: string
  uf: string
  cidade_aluno: string
  vestibulares_interesse: string[]
  mentor_id: string
}

const FORM_VAZIO: FormAluno = {
  nome: '', email: '', telefone: '', modalidade: '',
  turma_id: '', status_aluno: 'Ativo', data_nascimento: '',
  uf: '', cidade_aluno: '', vestibulares_interesse: [], mentor_id: '',
}

export default function NovoAlunoMed() {
  const router = useRouter()
  const { perfil } = useAuth()
  const [aba, setAba] = useState<'individual' | 'lote'>('individual')
  const [turmas, setTurmas] = useState<any[]>([])
  const [mentores, setMentores] = useState<any[]>([])
  const [form, setForm] = useState<FormAluno>(FORM_VAZIO)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [vestOpen, setVestOpen] = useState(false)

  // Lote
  const [alunosLote, setAlunosLote] = useState<any[]>([])
  const [savingLote, setSavingLote] = useState(false)
  const [erroLote, setErroLote] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (perfil && perfil.papel !== 'coordenador' && perfil.papel !== 'direcao') router.replace('/')
    Promise.all([
      dbQuery('turmas', { tipo: 'eq.Medicina', order: 'nome' }),
      dbQuery('mentores', { aceitando_alunos: 'eq.true', order: 'nome' }),
    ]).then(([{ data: t }, { data: m }]) => {
      setTurmas(t || [])
      setMentores(m || [])
    })
  }, [perfil])

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

  async function salvarIndividual() {
    if (!form.nome || !form.email || !form.telefone || !form.modalidade || !form.turma_id) {
      setError('Preencha todos os campos obrigatórios: Nome, E-mail, Celular, Modalidade e Turma.')
      return
    }
    setSaving(true); setError('')
    const { error: err } = await dbInsert('alunos', [{
      nome: form.nome,
      email: form.email,
      telefone: form.telefone,
      modalidade: form.modalidade,
      turma_id: form.turma_id,
      status_aluno: form.status_aluno || 'Ativo',
      data_nascimento: form.data_nascimento || null,
      uf: form.uf || null,
      cidade_aluno: form.cidade_aluno || null,
      vestibulares_interesse: form.vestibulares_interesse.length > 0 ? form.vestibulares_interesse : null,
      mentor_id: form.mentor_id || null,
      vertical: 'Medicina',
    }])
    if (err) { setError(err); setSaving(false) }
    else { setSucesso('Aluno cadastrado com sucesso!'); setForm(FORM_VAZIO); setSaving(false) }
  }

  function processarPlanilha(file: File) {
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const XLSX = await import('xlsx')
        const wb = XLSX.read(e.target?.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })
        const alunos = rows
          .slice(1) // pula cabeçalho
          .filter(r => r[0] && r[1])
          .map(r => ({
            nome: String(r[0] || '').trim(),
            email: String(r[1] || '').trim(),
            telefone: String(r[2] || '').trim(),
            modalidade: String(r[3] || '').trim(),
            turma_nome: String(r[4] || '').trim(),
          }))
        setAlunosLote(alunos)
        setErroLote('')
      } catch {
        setErroLote('Erro ao ler a planilha. Verifique o formato.')
      }
    }
    reader.readAsBinaryString(file)
  }

  async function salvarLote() {
    if (!alunosLote.length) return
    setSavingLote(true); setErroLote('')
    const erros: string[] = []
    const registros = alunosLote.map((a, i) => {
      const turma = turmas.find(t => t.nome.toLowerCase() === a.turma_nome.toLowerCase())
      if (!turma) erros.push(`Linha ${i + 2}: turma "${a.turma_nome}" não encontrada`)
      return {
        nome: a.nome, email: a.email, telefone: a.telefone,
        modalidade: a.modalidade || null,
        turma_id: turma?.id || null,
        status_aluno: 'Ativo', vertical: 'Medicina',
      }
    })
    if (erros.length) { setErroLote(erros.join('\n')); setSavingLote(false); return }
    const { error: err } = await dbInsert('alunos', registros)
    if (err) { setErroLote(err); setSavingLote(false) }
    else { setSucesso(`${registros.length} aluno(s) cadastrado(s) com sucesso!`); setAlunosLote([]); setSavingLote(false) }
  }

  const Field = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
    <div>
      <label style={{ fontSize: 12, fontWeight: 500, color: '#555', display: 'block', marginBottom: 6 }}>
        {label}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  )

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    border: '1px solid rgba(0,0,0,0.12)', fontSize: 14,
    background: 'white', outline: 'none', boxSizing: 'border-box' as const,
    fontFamily: 'DM Sans, sans-serif', color: '#1a1a1a',
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <Nav />
      <div style={{
        background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)',
        padding: '16px 20px', position: 'sticky', top: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>←</button>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Cadastrar aluno</div>
          <div style={{ fontSize: 11, color: '#999' }}>Medicina</div>
        </div>
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(0,0,0,0.08)', background: 'white', padding: '0 20px' }}>
        {[
          { id: 'individual', label: 'Individual', icon: <UserPlus size={14} /> },
          { id: 'lote', label: 'Importar planilha', icon: <Upload size={14} /> },
        ].map(a => (
          <button key={a.id} onClick={() => setAba(a.id as any)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: aba === a.id ? 600 : 400,
            color: aba === a.id ? 'var(--purple)' : '#888',
            borderBottom: aba === a.id ? '2px solid var(--purple)' : '2px solid transparent',
            fontFamily: 'DM Sans, sans-serif',
          }}>
            {a.icon} {a.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '20px 16px', maxWidth: 640, margin: '0 auto' }}>

        {sucesso && (
          <div style={{
            background: '#F0FDF4', color: '#166534', borderRadius: 12,
            padding: '12px 16px', marginBottom: 16, fontSize: 13, fontWeight: 500,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            {sucesso}
            <button onClick={() => setSucesso('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534' }}><X size={14} /></button>
          </div>
        )}

        {/* ── ABA INDIVIDUAL ── */}
        {aba === 'individual' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div style={{ fontSize: 12, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Dados obrigatórios
            </div>

            <Field label="Nome completo" required>
              <input style={inputStyle} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Lucas Ferreira" />
            </Field>

            <Field label="E-mail" required>
              <input style={inputStyle} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="aluno@email.com" />
            </Field>

            <Field label="Celular (WhatsApp)" required>
              <input style={inputStyle} value={form.telefone}
                onChange={e => setForm({ ...form, telefone: formatTelefone(e.target.value) })}
                placeholder="(11) 99999-9999" />
            </Field>

            <Field label="Modalidade" required>
              <div style={{ display: 'flex', gap: 8 }}>
                {['Presencial', 'Online'].map(m => (
                  <button key={m} onClick={() => setForm({ ...form, modalidade: m as any })} style={{
                    flex: 1, padding: '10px', borderRadius: 10, border: '1px solid',
                    cursor: 'pointer', fontSize: 13, fontWeight: 500,
                    fontFamily: 'DM Sans, sans-serif',
                    borderColor: form.modalidade === m ? 'var(--purple)' : 'rgba(0,0,0,0.12)',
                    background: form.modalidade === m ? 'var(--purple-light)' : 'white',
                    color: form.modalidade === m ? 'var(--purple)' : '#555',
                  }}>{m}</button>
                ))}
              </div>
            </Field>

            <Field label="Turma" required>
              <select style={inputStyle} value={form.turma_id} onChange={e => setForm({ ...form, turma_id: e.target.value })}>
                <option value="">Selecione a turma</option>
                {turmas.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </Field>

            <div style={{ fontSize: 12, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 8 }}>
              Dados opcionais
            </div>

            <Field label="Status do aluno">
              <select style={inputStyle} value={form.status_aluno} onChange={e => setForm({ ...form, status_aluno: e.target.value })}>
                <option value="Ativo">Ativo</option>
                <option value="Ativo - Não optou pela mentoria">Ativo – Não optou pela mentoria</option>
                <option value="Ativo - Sem contato">Ativo – Sem contato</option>
                <option value="Ativo - Sem resposta">Ativo – Sem resposta</option>
                <option value="Inativo - Cancelou o curso">Inativo – Cancelou o curso</option>
              </select>
            </Field>

            <Field label="Data de nascimento">
              <input style={inputStyle} type="date" value={form.data_nascimento} onChange={e => setForm({ ...form, data_nascimento: e.target.value })} />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
              <Field label="UF">
                <select style={inputStyle} value={form.uf} onChange={e => setForm({ ...form, uf: e.target.value })}>
                  <option value="">—</option>
                  {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </Field>
              <Field label="Cidade">
                <input style={inputStyle} value={form.cidade_aluno} onChange={e => setForm({ ...form, cidade_aluno: e.target.value })} placeholder="Ex: São Paulo" />
              </Field>
            </div>

            {/* Vestibulares de interesse */}
            <Field label="Vestibulares de interesse">
              <div style={{ border: '1px solid rgba(0,0,0,0.12)', borderRadius: 10, overflow: 'hidden' }}>
                <button
                  onClick={() => setVestOpen(v => !v)}
                  style={{
                    width: '100%', padding: '10px 14px', background: 'white', border: 'none',
                    cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    fontSize: 13, color: form.vestibulares_interesse.length ? '#1a1a1a' : '#aaa',
                    fontFamily: 'DM Sans, sans-serif',
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
            </Field>

            <Field label="Mentor responsável">
              <select style={inputStyle} value={form.mentor_id} onChange={e => setForm({ ...form, mentor_id: e.target.value })}>
                <option value="">Sem mentor atribuído</option>
                {mentores.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </Field>

            {error && (
              <div style={{ background: '#FEF2F2', color: '#991B1B', fontSize: 13, padding: '10px 14px', borderRadius: 10 }}>{error}</div>
            )}

            <button
              onClick={salvarIndividual}
              disabled={saving}
              style={{
                padding: '13px', borderRadius: 12, border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                background: saving ? '#aaa' : 'var(--purple)', color: 'white',
                fontSize: 15, fontWeight: 600, fontFamily: 'DM Sans, sans-serif', marginTop: 4,
              }}
            >
              {saving ? 'Cadastrando...' : 'Cadastrar aluno'}
            </button>
          </div>
        )}

        {/* ── ABA LOTE ── */}
        {aba === 'lote' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', borderRadius: 12, padding: 16, border: '1px solid rgba(0,0,0,0.08)', fontSize: 13, color: '#555', lineHeight: 1.7 }}>
              <strong>Formato da planilha:</strong><br />
              Coluna A: Nome · Coluna B: E-mail · Coluna C: Celular · Coluna D: Presencial ou Online · Coluna E: Nome da turma
            </div>

            <div
              onClick={() => fileRef.current?.click()}
              style={{
                border: '2px dashed rgba(0,0,0,0.15)', borderRadius: 14, padding: '40px 20px',
                textAlign: 'center', cursor: 'pointer', background: '#FAFAFA',
              }}
            >
              <Upload size={28} color="#aaa" style={{ marginBottom: 10 }} />
              <div style={{ fontSize: 14, fontWeight: 500, color: '#555' }}>Clique para selecionar a planilha</div>
              <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>.xlsx ou .csv</div>
              <input
                ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
                onChange={e => { if (e.target.files?.[0]) processarPlanilha(e.target.files[0]) }}
              />
            </div>

            {alunosLote.length > 0 && (
              <>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {alunosLote.length} aluno(s) encontrado(s) na planilha
                </div>
                <div style={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC' }}>
                        {['Nome', 'E-mail', 'Celular', 'Modalidade', 'Turma'].map(h => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#666', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {alunosLote.map((a, i) => (
                        <tr key={i} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
                          <td style={{ padding: '7px 12px', fontWeight: 500 }}>{a.nome}</td>
                          <td style={{ padding: '7px 12px', color: '#666' }}>{a.email}</td>
                          <td style={{ padding: '7px 12px', color: '#666' }}>{a.telefone}</td>
                          <td style={{ padding: '7px 12px', color: '#666' }}>{a.modalidade}</td>
                          <td style={{ padding: '7px 12px', color: '#666' }}>{a.turma_nome}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {erroLote && (
              <div style={{ background: '#FEF2F2', color: '#991B1B', fontSize: 12, padding: '10px 14px', borderRadius: 10, whiteSpace: 'pre-line' }}>{erroLote}</div>
            )}

            {alunosLote.length > 0 && (
              <button
                onClick={salvarLote}
                disabled={savingLote}
                style={{
                  padding: '13px', borderRadius: 12, border: 'none', cursor: savingLote ? 'not-allowed' : 'pointer',
                  background: savingLote ? '#aaa' : 'var(--purple)', color: 'white',
                  fontSize: 15, fontWeight: 600, fontFamily: 'DM Sans, sans-serif',
                }}
              >
                {savingLote ? 'Cadastrando...' : `Cadastrar ${alunosLote.length} aluno(s)`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
