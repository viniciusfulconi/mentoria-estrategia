'use client'
import { useEffect, useState, useMemo } from 'react'
import { dbQuery, dbUpdate } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Nav from '@/components/Nav'
import Link from 'next/link'
import { ChevronRight, Check, X, Search } from 'lucide-react'

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  'Ativo': { label: 'Ativo', bg: '#DCFCE7', color: '#166534' },
  'Ativo - Não optou pela mentoria': { label: 'Não optou pela mentoria', bg: '#DBEAFE', color: '#1e40af' },
  'Ativo - Sem contato': { label: 'Sem contato', bg: '#FEF9C3', color: '#854d0e' },
  'Ativo - Sem resposta': { label: 'Sem resposta', bg: '#EDE9FE', color: '#5b21b6' },
  'Inativo - Cancelou o curso': { label: 'Cancelou', bg: '#FEE2E2', color: '#991b1b' },
}

type AlunoMed = {
  id: string
  nome: string
  email: string
  telefone?: string
  modalidade?: string
  status_aluno: string
  turma_id?: string
  mentor_id?: string
  mentor_aceite?: boolean | null
  vestibulares_interesse?: string[]
  turmas?: { nome: string }
}

export default function MentorMed() {
  const router = useRouter()
  const { perfil } = useAuth()
  const [mentorId, setMentorId] = useState<string | null>(null)
  const [pendentes, setPendentes] = useState<AlunoMed[]>([])
  const [alunos, setAlunos] = useState<AlunoMed[]>([])
  const [carregando, setCarregando] = useState(true)
  const [processando, setProcessando] = useState<string | null>(null)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    if (!perfil) return
    if (perfil.papel !== 'mentor') { router.replace('/'); return }
    if (perfil.vertical !== 'Medicina') { router.replace('/mentor'); return }
    carregar()
  }, [perfil])

  async function carregar() {
    setCarregando(true)
    const nomeRef = perfil!.mentor_nome || perfil!.nome
    const { data: mData } = await dbQuery('mentores', { nome: `eq.${nomeRef}` }, 'id')
    if (!mData || mData.length === 0) { setCarregando(false); return }
    const mid = mData[0].id
    setMentorId(mid)

    const { data: aData } = await dbQuery<AlunoMed>(
      'alunos',
      { mentor_id: `eq.${mid}`, vertical: 'eq.Medicina', order: 'nome' },
      '*,turmas(nome)'
    )
    const lista = aData || []
    setPendentes(lista.filter(a => a.mentor_aceite === null))
    setAlunos(lista.filter(a => a.mentor_aceite === true))
    setCarregando(false)
  }

  async function aceitar(alunoId: string) {
    setProcessando(alunoId)
    await dbUpdate('alunos', { id: `eq.${alunoId}` }, {
      mentor_aceite: true,
      status_aluno: 'Ativo - Sem contato',
    })
    setProcessando(null)
    await carregar()
  }

  async function recusar(alunoId: string) {
    setProcessando(alunoId)
    await dbUpdate('alunos', { id: `eq.${alunoId}` }, {
      mentor_id: null,
      mentor_aceite: null,
    })
    setProcessando(null)
    await carregar()
  }

  const alunosFiltrados = useMemo(() => {
    if (!busca) return alunos
    return alunos.filter(a => a.nome.toLowerCase().includes(busca.toLowerCase()))
  }, [alunos, busca])

  function Avatar({ nome }: { nome: string }) {
    const iniciais = nome.split(' ').map(w => w[0]).slice(0, 2).join('')
    return (
      <div style={{
        width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
        background: 'var(--purple-light)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 700, color: 'var(--purple)',
      }}>
        {iniciais}
      </div>
    )
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <Nav />

      {/* Header */}
      <div style={{
        background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)',
        padding: '16px 20px',
      }}>
        <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>Mentor · Medicina</div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>{perfil?.mentor_nome || perfil?.nome}</div>
      </div>

      {carregando ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#aaa', fontSize: 13 }}>Carregando...</div>
      ) : !mentorId ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#aaa', fontSize: 13 }}>
          Perfil de mentor não encontrado. Entre em contato com o coordenador.
        </div>
      ) : (
        <div style={{ padding: '16px 16px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Pendentes */}
          {pendentes.length > 0 && (
            <section>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
              }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Aguardando sua resposta</div>
                <span style={{
                  background: '#FEF9C3', color: '#854d0e',
                  fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                }}>
                  {pendentes.length}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {pendentes.map(aluno => (
                  <div key={aluno.id} style={{
                    background: 'white', borderRadius: 14, padding: '14px 16px',
                    border: '1.5px solid #FDE68A',
                    boxShadow: '0 1px 4px rgba(251,191,36,0.12)',
                  }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
                      <Avatar nome={aluno.nome} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{aluno.nome}</div>
                        <div style={{ fontSize: 12, color: '#888' }}>{aluno.email}</div>
                        {aluno.telefone && (
                          <div style={{ fontSize: 12, color: '#888' }}>{aluno.telefone}</div>
                        )}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                          {aluno.turmas?.nome && (
                            <span style={{ fontSize: 11, color: '#888', background: '#F1F5F9', padding: '2px 8px', borderRadius: 10 }}>
                              {aluno.turmas.nome}
                            </span>
                          )}
                          {aluno.modalidade && (
                            <span style={{ fontSize: 11, color: '#888', background: '#F1F5F9', padding: '2px 8px', borderRadius: 10 }}>
                              {aluno.modalidade}
                            </span>
                          )}
                        </div>
                        {aluno.vestibulares_interesse && aluno.vestibulares_interesse.length > 0 && (
                          <div style={{ marginTop: 6 }}>
                            <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4 }}>Vestibulares de interesse:</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {aluno.vestibulares_interesse.slice(0, 6).map(v => (
                                <span key={v} style={{
                                  fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10,
                                  background: 'var(--purple-light)', color: 'var(--purple)',
                                }}>
                                  {v}
                                </span>
                              ))}
                              {aluno.vestibulares_interesse.length > 6 && (
                                <span style={{ fontSize: 10, color: '#aaa' }}>
                                  +{aluno.vestibulares_interesse.length - 6}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => recusar(aluno.id)}
                        disabled={processando === aluno.id}
                        style={{
                          flex: 1, padding: '10px', borderRadius: 10,
                          border: '1px solid rgba(0,0,0,0.12)', background: 'white',
                          fontSize: 13, fontWeight: 600, cursor: processando === aluno.id ? 'not-allowed' : 'pointer',
                          color: '#888', fontFamily: 'DM Sans, sans-serif',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}
                      >
                        <X size={14} /> Recusar
                      </button>
                      <button
                        onClick={() => aceitar(aluno.id)}
                        disabled={processando === aluno.id}
                        style={{
                          flex: 2, padding: '10px', borderRadius: 10, border: 'none',
                          background: processando === aluno.id ? '#ccc' : 'var(--purple)',
                          color: 'white', fontSize: 13, fontWeight: 600,
                          cursor: processando === aluno.id ? 'not-allowed' : 'pointer',
                          fontFamily: 'DM Sans, sans-serif',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}
                      >
                        <Check size={14} /> Aceitar aluno
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Meus alunos */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                Meus alunos
                {alunos.length > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 400, color: '#aaa', marginLeft: 6 }}>
                    ({alunos.length})
                  </span>
                )}
              </div>
            </div>

            {alunos.length > 4 && (
              <div style={{ position: 'relative', marginBottom: 10 }}>
                <Search size={14} color="#aaa" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  placeholder="Buscar aluno..."
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  style={{
                    width: '100%', padding: '9px 12px 9px 34px', borderRadius: 10,
                    border: '1px solid rgba(0,0,0,0.10)', fontSize: 13, background: 'white',
                    fontFamily: 'DM Sans, sans-serif', outline: 'none', boxSizing: 'border-box' as const,
                  }}
                />
              </div>
            )}

            {alunosFiltrados.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 20px', color: '#aaa', fontSize: 13 }}>
                {alunos.length === 0 ? 'Nenhum aluno aceito ainda.' : 'Nenhum aluno encontrado.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {alunosFiltrados.map(aluno => {
                  const cfg = STATUS_CONFIG[aluno.status_aluno] || STATUS_CONFIG['Ativo']
                  return (
                    <Link
                      key={aluno.id}
                      href={`/med/alunos/${aluno.id}`}
                      style={{ textDecoration: 'none' }}
                    >
                      <div style={{
                        background: 'white', borderRadius: 14, padding: '14px 16px',
                        border: '0.5px solid rgba(0,0,0,0.08)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        display: 'flex', alignItems: 'center', gap: 12,
                      }}>
                        <Avatar nome={aluno.nome} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>
                            {aluno.nome}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
                            <span style={{
                              background: cfg.bg, color: cfg.color,
                              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                            }}>
                              {cfg.label}
                            </span>
                            {aluno.turmas?.nome && (
                              <span style={{ fontSize: 11, color: '#999' }}>{aluno.turmas.nome}</span>
                            )}
                            {aluno.modalidade && (
                              <span style={{ fontSize: 11, color: '#999' }}>{aluno.modalidade}</span>
                            )}
                          </div>
                        </div>
                        <ChevronRight size={18} color="#ccc" />
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
