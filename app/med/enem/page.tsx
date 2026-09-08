'use client'
import { useEffect, useState } from 'react'
import { dbQuery } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Nav from '@/components/Nav'
import Link from 'next/link'
import { ChevronRight, FileText } from 'lucide-react'

type Prova = { id: string; titulo: string; ano: number; pdf_url: string | null }
type Tentativa = { id: string; prova_id: string; aluno_id: string; status: string; resultado: any }

export default function EnemLista() {
  const router = useRouter()
  const { perfil } = useAuth()
  const [provas, setProvas] = useState<Prova[]>([])
  const [tentativas, setTentativas] = useState<Tentativa[]>([])
  const [carregando, setCarregando] = useState(true)

  const isAluno = perfil?.papel === 'aluno'

  useEffect(() => {
    if (!perfil) return
    if (!['coordenador', 'direcao', 'mentor', 'aluno'].includes(perfil.papel)) { router.replace('/'); return }

    Promise.all([
      dbQuery<Prova>('enem_provas', { status: 'eq.published', vertical: 'eq.Medicina', order: 'ano.desc' }, 'id,titulo,ano,pdf_url'),
      dbQuery<Tentativa>('enem_tentativas', isAluno && perfil.aluno_id
        ? { aluno_id: `eq.${perfil.aluno_id}` }
        : { status: 'eq.enviada' }, 'id,prova_id,aluno_id,status,resultado'),
    ]).then(([{ data: p }, { data: t }]) => {
      setProvas(p || [])
      setTentativas(t || [])
      setCarregando(false)
    })
  }, [perfil])

  return (
    <div style={{ paddingBottom: 80 }}>
      <Nav />
      <div style={{
        background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)',
        padding: '16px 20px', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>Provas do ENEM</div>
        <div style={{ fontSize: 11, color: '#999' }}>
          {isAluno ? 'Baixe o caderno, preencha o cartão e receba sua nota por área' : 'Medicina'}
        </div>
      </div>

      <div style={{ padding: 16, maxWidth: 720, margin: '0 auto' }}>
        {isAluno && (
          <div style={{
            background: 'var(--navy-light)', border: '1px solid #bfdbfe', borderRadius: 12,
            padding: '12px 14px', fontSize: 12.5, color: '#1e3a8a', lineHeight: 1.55, marginBottom: 14,
          }}>
            A nota sai por <b>TRI de verdade</b> (o mesmo modelo do INEP), calibrada com o
            microdado daquele ano — então acertar questão difícil vale mais do que acertar fácil,
            e chute em série derruba a nota.
          </div>
        )}

        {carregando ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#aaa', fontSize: 13 }}>Carregando…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {provas.map(p => {
              const minha = isAluno ? tentativas.find(t => t.prova_id === p.id) : null
              const enviadas = !isAluno ? tentativas.filter(t => t.prova_id === p.id).length : 0
              const nota = minha?.resultado?.nota_media_areas
              return (
                <Link key={p.id} href={`/med/enem/${p.id}`} style={{
                  display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit',
                  background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: '13px 15px',
                }}>
                  <FileText size={17} color="var(--text-hint)" style={{ flex: 'none' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{p.titulo}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-hint)', marginTop: 2 }}>
                      {isAluno
                        ? (minha?.status === 'enviada'
                            ? `Enviada · média ${nota != null ? nota.toFixed(0) : '—'}`
                            : minha ? 'Em andamento' : 'Não iniciada')
                        : `${enviadas} envio(s)`}
                    </div>
                  </div>
                  {isAluno && minha?.status === 'enviada' && (
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
                      background: 'var(--teal-light)', color: 'var(--teal-dark)',
                    }}>
                      {nota != null ? nota.toFixed(0) : '✓'}
                    </span>
                  )}
                  <ChevronRight size={16} color="var(--text-hint)" />
                </Link>
              )
            })}
            {provas.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: '#aaa', fontSize: 13 }}>
                Nenhuma prova publicada.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
