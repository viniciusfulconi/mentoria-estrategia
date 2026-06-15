'use client'
import { useEffect, useState } from 'react'
import { dbQuery } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import Nav from '@/components/Nav'
import Link from 'next/link'

export default function Cronograma() {
  const { perfil, verticalAtiva } = useAuth()
  const [concursos, setConcursos] = useState<any[]>([])
  const [alunos, setAlunos] = useState<any[]>([])
  const [topicos, setTopicos] = useState<any[]>([])
  const [progressos, setProgressos] = useState<any[]>([])
  const [aba, setAba] = useState<'alunos' | 'criticos'>('alunos')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [perfil, verticalAtiva])

  async function load() {
    setLoading(true)
    const vertical = verticalAtiva || 'ITA'

    const [{ data: cs }, { data: ts }, { data: ps }] = await Promise.all([
      dbQuery('concursos',            { vertical: `eq.${vertical}`, order: 'created_at.desc' }),
      dbQuery('arvore_subtopicos',    {}, 'id'),
      dbQuery('progresso_subtopicos', {}, 'aluno_id,subtopico_id,status'),
    ])
    setConcursos(cs || [])
    setTopicos(ts || [])
    setProgressos(ps || [])

    if (vertical === 'Medicina') {
      const params: Record<string, string> = { vertical: 'eq.Medicina', order: 'nome' }
      const { data: als } = await dbQuery('alunos', params, 'id,nome,mentores(nome)')
      const lista = (als || []).map((a: any) => ({
        id_aluno: a.id,
        nome: a.nome,
        mentor: a.mentores?.nome || null,
      }))
      const mentorNome = perfil?.mentor_nome || perfil?.nome
      if (perfil?.papel === 'mentor' && mentorNome) {
        setAlunos(lista.filter((a: any) => a.mentor === mentorNome))
      } else {
        setAlunos(lista)
      }
    } else {
      const { data: als } = await dbQuery('alunos_dados', { order: 'nome' })
      const lista = als || []
      if (perfil?.papel === 'mentor' && perfil.mentor_nome) {
        setAlunos(lista.filter((a: any) => a.mentor === perfil.mentor_nome))
      } else {
        setAlunos(lista)
      }
    }

    setLoading(false)
  }

  function pctAluno(alunoId: string) {
    const total = topicos.length
    if (!total) return 0
    const finalizados = progressos.filter((p: any) =>
      p.aluno_id === alunoId && p.status === 'finalizada'
    ).length
    return Math.round((finalizados / total) * 100)
  }

  const alunosComPct = alunos.map(a => ({ ...a, pct: pctAluno(a.id_aluno) }))
  const criticos = [...alunosComPct].sort((a, b) => a.pct - b.pct).slice(0, 10)

  const concurso = concursos[0]

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Cronograma</div>
        {perfil?.papel === 'coordenador' && (
          <Link href="/cronograma/novo" style={{ textDecoration: 'none', background: '#f97316', color: 'white', borderRadius: 10, padding: '7px 14px', fontSize: 13, fontWeight: 500 }}>
            {concurso ? '✎ Editar' : '+ Novo'}
          </Link>
        )}
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 4, padding: '8px 16px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
        {[{ id: 'alunos', label: 'Todos os alunos' }, { id: 'criticos', label: '⚠ Mais atrasados' }].map(a => (
          <button key={a.id} onClick={() => setAba(a.id as any)} style={{
            padding: '5px 14px', borderRadius: 16, fontSize: 11, border: 'none',
            background: aba === a.id ? '#1a1a1a' : '#F1F5F9',
            color: aba === a.id ? 'white' : '#666',
            cursor: 'pointer', fontFamily: 'DM Sans,sans-serif'
          }}>{a.label}</button>
        ))}
      </div>

      <div style={{ padding: 16 }}>
        {loading ? <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>Carregando...</div>
        : !concurso ? (
          <div className="card" style={{ textAlign: 'center', padding: 40, color: '#999' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
            <div style={{ marginBottom: 12 }}>Nenhum cronograma cadastrado ainda.</div>
            {perfil?.papel === 'coordenador' && (
              <Link href="/cronograma/novo" style={{ textDecoration: 'none', display: 'inline-block', background: '#f97316', color: 'white', borderRadius: 12, padding: '10px 20px', fontSize: 14 }}>Criar cronograma</Link>
            )}
          </div>
        ) : (
          <>
            {/* Header do concurso */}
            <div className="card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
              {concurso.logo_url && (
                <img src={concurso.logo_url} alt={concurso.nome} loading="lazy" style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover' }} />
              )}
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{concurso.nome}</div>
                <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>{topicos.length} subtópicos no edital</div>
              </div>
            </div>

            {/* Lista de alunos */}
            {aba === 'alunos' && alunosComPct.map(a => {
              const pct = a.pct
              const cor = pct >= 70 ? '#16A34A' : pct >= 40 ? '#D97706' : '#DC2626'
              return (
                <Link key={a.id_aluno} href={`/cronograma/${a.id_aluno}`} style={{ textDecoration: 'none' }}>
                  <div className="card" style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#1E40AF', flexShrink: 0 }}>
                        {a.nome.split(' ').map((w: string) => w[0]).slice(0, 2).join('')}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a' }}>{a.nome}</div>
                        <div style={{ fontSize: 11, color: '#999' }}>{a.mentor}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 18, fontWeight: 600, color: cor }}>{pct}%</div>
                        <div style={{ fontSize: 10, color: '#999' }}>do edital</div>
                      </div>
                    </div>
                    <div style={{ height: 4, background: '#F1F5F9', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: cor, borderRadius: 2 }} />
                    </div>
                  </div>
                </Link>
              )
            })}

            {/* Alunos críticos */}
            {aba === 'criticos' && criticos.map((a, i) => {
              const pct = a.pct
              return (
                <Link key={a.id_aluno} href={`/cronograma/${a.id_aluno}`} style={{ textDecoration: 'none' }}>
                  <div className="card" style={{ marginBottom: 8, borderLeft: pct < 30 ? '3px solid #DC2626' : '3px solid #D97706' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#999', minWidth: 24 }}>#{i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{a.nome}</div>
                        <div style={{ fontSize: 11, color: '#999' }}>{a.mentor}</div>
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 600, color: '#DC2626' }}>{pct}%</div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </>
        )}
      </div>
      <Nav />
    </div>
  )
}
