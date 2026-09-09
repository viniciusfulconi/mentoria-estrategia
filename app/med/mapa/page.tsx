'use client'
import { useEffect, useState } from 'react'
import { dbQuery } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Nav from '@/components/Nav'
import Link from 'next/link'
import PageHeader from '@/components/PageHeader'
import { Plus, ChevronRight, Target } from 'lucide-react'

type Mapa = {
  id: string
  aluno_id: string
  aluno_nome: string | null
  mentor_nome: string | null
  status: 'rascunho' | 'enviado'
  data_inicio: string | null
  data_fim: string | null
  enviado_em: string | null
  created_at: string
}

const dataBR = (d?: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—'

export default function MapasList() {
  const router = useRouter()
  const { perfil } = useAuth()
  const [mapas, setMapas] = useState<Mapa[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    if (!perfil) return
    const permitido = ['coordenador', 'direcao', 'mentor'].includes(perfil.papel)
    if (!permitido) { router.replace('/'); return }

    const params: Record<string, string> = { order: 'created_at.desc' }
    if (perfil.papel === 'mentor') params.mentor_nome = `eq.${perfil.mentor_nome || perfil.nome}`
    dbQuery<Mapa>('mapas_revisao', params).then(({ data }) => {
      setMapas(data || [])
      setCarregando(false)
    })
  }, [perfil])

  return (
    <div style={{ paddingBottom: 80 }}>
      <Nav />

      <PageHeader eyebrow="Medicina" title="Mapa de revisão" actions={
        <Link href="/med/mapa/novo" style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--purple)', color: 'white', textDecoration: 'none',
          padding: '9px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          boxShadow: '0 2px 8px rgba(249,115,22,0.32)',
        }}>
          <Plus size={15} /> Novo mapa
        </Link>
      } />

      <div style={{ padding: 16, maxWidth: 780, margin: '0 auto' }}>
        {carregando ? (
          <div style={{ color: 'var(--text-hint)', fontSize: 13, padding: 24, textAlign: 'center' }}>Carregando…</div>
        ) : mapas.length === 0 ? (
          <div style={{
            background: 'white', border: '1px solid var(--border)', borderRadius: 14,
            padding: '36px 24px', textAlign: 'center',
          }}>
            <Target size={28} color="var(--text-hint)" />
            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 10 }}>Nenhum mapa ainda</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
              Durante o atendimento, classifique os tópicos do aluno por incidência no vestibular
              e dificuldade. O sistema monta as tarefas e distribui no calendário dele.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {mapas.map(m => (
              <Link key={m.id} href={`/med/mapa/${m.id}`} style={{
                display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit',
                background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: '13px 15px',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{m.aluno_nome || 'Aluno'}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-hint)', marginTop: 2 }}>
                    {m.mentor_nome || '—'}
                    {m.data_inicio && ` · ${dataBR(m.data_inicio)} a ${dataBR(m.data_fim)}`}
                  </div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20,
                  background: m.status === 'enviado' ? 'var(--teal-light)' : 'var(--amber-light)',
                  color:      m.status === 'enviado' ? 'var(--teal-dark)'  : '#92400e',
                }}>
                  {m.status === 'enviado' ? 'Enviado' : 'Rascunho'}
                </span>
                <ChevronRight size={16} color="var(--text-hint)" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
