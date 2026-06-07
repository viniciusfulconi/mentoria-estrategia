'use client'
import { useState } from 'react'
import { dbInsert } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Nav from '@/components/Nav'
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'

const MATERIAS = [
  'Matemática','Física','Química','Inglês','Sociologia',
  'Filosofia','Artes','Biologia','História','Geografia','Espanhol','Redação',
]

type MateriaForm = {
  _id: string
  materia: string
  tipo: 'objetiva' | 'dissertativa'
  alternativas: 'A-D' | 'A-E'
  qtd_questoes: number
  pontuacao_por_questao: number
  criterio_eliminacao: string
  entra_media: boolean
  peso: number
}

type DiaForm = { _id: string; materias: MateriaForm[] }
type FaseForm = { _id: string; dias: DiaForm[] }

function uid() { return Math.random().toString(36).slice(2) }

function novaMateria(): MateriaForm {
  return {
    _id: uid(), materia: 'Matemática', tipo: 'objetiva', alternativas: 'A-E',
    qtd_questoes: 10, pontuacao_por_questao: 1,
    criterio_eliminacao: '', entra_media: true, peso: 1,
  }
}

function novoDia(): DiaForm { return { _id: uid(), materias: [novaMateria()] } }
function novaFase(): FaseForm { return { _id: uid(), dias: [novoDia()] } }

export default function NovoTemplate() {
  const router = useRouter()
  const { perfil } = useAuth()
  const [nome, setNome] = useState('')
  const [fases, setFases] = useState<FaseForm[]>([novaFase()])
  const [formulaKatex, setFormulaKatex] = useState('')
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')
  const [diasExpandidos, setDiasExpandidos] = useState<Record<string, boolean>>({})

  if (perfil && perfil.papel !== 'coordenador' && perfil.papel !== 'direcao') {
    router.replace('/'); return null
  }

  function setNumFases(n: number) {
    setFases(prev => {
      const arr = [...prev]
      while (arr.length < n) arr.push(novaFase())
      return arr.slice(0, n)
    })
  }

  function setNumDias(fi: number, n: number) {
    setFases(prev => prev.map((f, i) => {
      if (i !== fi) return f
      const dias = [...f.dias]
      while (dias.length < n) dias.push(novoDia())
      return { ...f, dias: dias.slice(0, n) }
    }))
  }

  function addMateria(fi: number, di: number) {
    setFases(prev => prev.map((f, i) => i !== fi ? f : {
      ...f, dias: f.dias.map((d, j) => j !== di ? d : {
        ...d, materias: [...d.materias, novaMateria()],
      }),
    }))
  }

  function removeMateria(fi: number, di: number, mi: number) {
    setFases(prev => prev.map((f, i) => i !== fi ? f : {
      ...f, dias: f.dias.map((d, j) => j !== di ? d : {
        ...d, materias: d.materias.filter((_, k) => k !== mi),
      }),
    }))
  }

  function updateMateria(fi: number, di: number, mi: number, field: keyof MateriaForm, value: any) {
    setFases(prev => prev.map((f, i) => i !== fi ? f : {
      ...f, dias: f.dias.map((d, j) => j !== di ? d : {
        ...d, materias: d.materias.map((m, k) => k !== mi ? m : { ...m, [field]: value }),
      }),
    }))
  }

  async function salvar() {
    if (!nome.trim()) { setErro('Informe o nome do modelo.'); return }
    setSaving(true); setErro('')

    const fasesPayload = fases.map((f, fi) => ({
      numero: fi + 1,
      dias: f.dias.map((d, di) => ({
        numero: di + 1,
        materias: d.materias.map(m => ({
          materia: m.materia, tipo: m.tipo,
          alternativas: m.tipo === 'objetiva' ? m.alternativas : null,
          qtd_questoes: m.qtd_questoes,
          pontuacao_por_questao: m.pontuacao_por_questao,
          criterio_eliminacao: m.criterio_eliminacao || null,
          entra_media: m.entra_media,
          peso: m.entra_media ? m.peso : null,
        })),
      })),
    }))

    const { error } = await dbInsert('simulado_templates', [{
      nome: nome.trim(), vertical: 'Medicina',
      fases: fasesPayload,
      formula_katex: formulaKatex.trim() || null,
    }])

    setSaving(false)
    if (error) setErro(error)
    else router.push('/med/simulados/templates')
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    border: '1px solid rgba(0,0,0,0.12)', fontSize: 14,
    background: 'white', outline: 'none', boxSizing: 'border-box',
    fontFamily: 'DM Sans, sans-serif', color: '#1a1a1a',
  }

  const btn = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '8px', borderRadius: 8,
    border: `1px solid ${active ? 'var(--purple)' : 'rgba(0,0,0,0.12)'}`,
    background: active ? 'var(--purple-light)' : 'white',
    color: active ? 'var(--purple)' : '#555',
    cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'DM Sans, sans-serif',
  })

  return (
    <div style={{ paddingBottom: 100 }}>
      <Nav />

      <div style={{
        background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)',
        padding: '16px 20px', position: 'sticky', top: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa' }}>←</button>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Novo modelo de prova</div>
          <div style={{ fontSize: 11, color: '#999' }}>Medicina</div>
        </div>
      </div>

      <div style={{ padding: '20px 16px', maxWidth: 700, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {erro && <div style={{ background: '#FEF2F2', color: '#991B1B', fontSize: 13, padding: '10px 14px', borderRadius: 10 }}>{erro}</div>}

        {/* Nome */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#666', display: 'block', marginBottom: 6 }}>
            Nome do modelo <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input style={inp} value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: FUVEST, Unicamp, ENEM..." />
        </div>

        {/* Nº fases */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#666', display: 'block', marginBottom: 8 }}>Número de fases *</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[1, 2, 3].map(n => (
              <button key={n} onClick={() => setNumFases(n)} style={{
                padding: '10px 24px', borderRadius: 10, cursor: 'pointer',
                fontFamily: 'DM Sans, sans-serif', fontSize: 14, fontWeight: 600,
                border: `1.5px solid ${fases.length === n ? 'var(--purple)' : 'rgba(0,0,0,0.12)'}`,
                background: fases.length === n ? 'var(--purple-light)' : 'white',
                color: fases.length === n ? 'var(--purple)' : '#555',
              }}>
                {n} {n === 1 ? 'fase' : 'fases'}
              </button>
            ))}
          </div>
        </div>

        {/* Fases */}
        {fases.map((fase, fi) => (
          <div key={fase._id} style={{ border: '1px solid rgba(0,0,0,0.10)', borderRadius: 14, overflow: 'hidden' }}>
            {/* Header fase */}
            <div style={{
              background: '#F8FAFC', padding: '12px 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              borderBottom: '1px solid rgba(0,0,0,0.08)',
            }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Fase {fi + 1}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: '#888' }}>Dias:</span>
                {[
                  { label: '−', action: () => setNumDias(fi, Math.max(1, fase.dias.length - 1)) },
                  { label: '+', action: () => setNumDias(fi, fase.dias.length + 1) },
                ].map(({ label, action }, idx) => (
                  <button key={idx} onClick={action} style={{
                    width: 28, height: 28, borderRadius: 6, border: '1px solid rgba(0,0,0,0.12)',
                    background: 'white', cursor: 'pointer', fontSize: 16,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{label}</button>
                ))}
                <span style={{ fontSize: 14, fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{fase.dias.length}</span>
              </div>
            </div>

            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {fase.dias.map((dia, di) => {
                const k = `${fi}-${di}`
                const exp = diasExpandidos[k] !== false
                return (
                  <div key={dia._id} style={{ border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 10 }}>
                    <button
                      onClick={() => setDiasExpandidos(p => ({ ...p, [k]: !exp }))}
                      style={{
                        width: '100%', padding: '10px 14px', background: '#FAFAFA',
                        border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        borderRadius: exp ? '10px 10px 0 0' : 10, fontFamily: 'DM Sans, sans-serif',
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Dia {di + 1}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, color: '#aaa' }}>{dia.materias.length} matéria{dia.materias.length !== 1 ? 's' : ''}</span>
                        {exp ? <ChevronUp size={14} color="#aaa" /> : <ChevronDown size={14} color="#aaa" />}
                      </div>
                    </button>

                    {exp && (
                      <div style={{ padding: '12px', borderTop: '0.5px solid rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {dia.materias.map((mat, mi) => (
                          <div key={mat._id} style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Matéria {mi + 1}</span>
                              {dia.materias.length > 1 && (
                                <button onClick={() => removeMateria(fi, di, mi)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', display: 'flex' }}>
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              <div>
                                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Matéria</label>
                                <select style={inp} value={mat.materia} onChange={e => updateMateria(fi, di, mi, 'materia', e.target.value)}>
                                  {MATERIAS.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                              </div>

                              <div>
                                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Tipo</label>
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button style={btn(mat.tipo === 'objetiva')} onClick={() => updateMateria(fi, di, mi, 'tipo', 'objetiva')}>Objetiva</button>
                                  <button style={btn(mat.tipo === 'dissertativa')} onClick={() => updateMateria(fi, di, mi, 'tipo', 'dissertativa')}>Dissertativa</button>
                                </div>
                              </div>

                              {mat.tipo === 'objetiva' && (
                                <div>
                                  <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Alternativas</label>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <button style={btn(mat.alternativas === 'A-D')} onClick={() => updateMateria(fi, di, mi, 'alternativas', 'A-D')}>A–D</button>
                                    <button style={btn(mat.alternativas === 'A-E')} onClick={() => updateMateria(fi, di, mi, 'alternativas', 'A-E')}>A–E</button>
                                  </div>
                                </div>
                              )}

                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                <div>
                                  <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Qtd. questões</label>
                                  <input style={inp} type="number" min={1} value={mat.qtd_questoes}
                                    onChange={e => updateMateria(fi, di, mi, 'qtd_questoes', Math.max(1, Number(e.target.value)))} />
                                </div>
                                <div>
                                  <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Pontos/questão</label>
                                  <input style={inp} type="number" min={0} step={0.25} value={mat.pontuacao_por_questao}
                                    onChange={e => updateMateria(fi, di, mi, 'pontuacao_por_questao', Number(e.target.value))} />
                                </div>
                              </div>

                              <div>
                                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Critério de eliminação (opcional)</label>
                                <input style={inp} value={mat.criterio_eliminacao}
                                  onChange={e => updateMateria(fi, di, mi, 'criterio_eliminacao', e.target.value)}
                                  placeholder="Ex: menos de 20% de acerto" />
                              </div>

                              <div>
                                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Entra na média final?</label>
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button style={btn(mat.entra_media === true)} onClick={() => updateMateria(fi, di, mi, 'entra_media', true)}>Sim</button>
                                  <button style={btn(mat.entra_media === false)} onClick={() => updateMateria(fi, di, mi, 'entra_media', false)}>Não</button>
                                </div>
                              </div>

                              {mat.entra_media && (
                                <div>
                                  <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Peso na média</label>
                                  <input style={{ ...inp, maxWidth: 120 }} type="number" min={0} step={0.1} value={mat.peso}
                                    onChange={e => updateMateria(fi, di, mi, 'peso', Number(e.target.value))} />
                                </div>
                              )}
                            </div>
                          </div>
                        ))}

                        <button
                          onClick={() => addMateria(fi, di)}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            padding: '10px', borderRadius: 10, border: '1.5px dashed rgba(0,0,0,0.15)',
                            background: 'transparent', color: 'var(--purple)', cursor: 'pointer',
                            fontSize: 13, fontWeight: 600, fontFamily: 'DM Sans, sans-serif',
                          }}
                        >
                          <Plus size={14} /> Adicionar matéria
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {/* Fórmula */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#666', display: 'block', marginBottom: 6 }}>
            Fórmula da média — notação KaTeX (opcional)
          </label>
          <input style={inp} value={formulaKatex} onChange={e => setFormulaKatex(e.target.value)}
            placeholder={String.raw`Ex: \frac{3M + 2{,}5F + 2{,}5Q + P + I}{10}`} />
        </div>

        <button
          onClick={salvar} disabled={saving}
          style={{
            padding: 14, borderRadius: 12, border: 'none',
            background: saving ? '#ccc' : 'var(--purple)',
            color: 'white', fontSize: 15, fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
            fontFamily: 'DM Sans, sans-serif',
          }}
        >
          {saving ? 'Salvando...' : 'Salvar modelo de prova'}
        </button>
      </div>
    </div>
  )
}
