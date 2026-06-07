'use client'
import { useEffect, useState } from 'react'
import { dbQuery } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Nav from '@/components/Nav'
import Link from 'next/link'
import { Plus, ChevronRight, FileText } from 'lucide-react'

const STATUS_SIM: Record<string, { label: string; bg: string; color: string }> = {
  criado:          { label: 'Criado',          bg: '#F1F5F9', color: '#475569' },
  com_gabarito:    { label: 'Com gabarito',    bg: '#DBEAFE', color: '#1e40af' },
  com_resultados:  { label: 'Com resultados',  bg: '#DCFCE7', color: '#166534' },
}

type Simulado = {
  id: string
  nome: string
  status: string
  turma_id: string | null
  created_at: string
  turmas?: { nome: string }
  simulado_templates?: { nome: string }
}

export default function SimuladosMed() {
  const router = useRouter()
  const { perfil } = useAuth()
  const [simulados, setSimulados] = useState<Simulado[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    if (perfil && perfil.papel !== 'coordenador' && perfil.papel !== 'direcao') { router.replace('/'); return }
    dbQuery<Simulado>('simulados_med', { vertical: 'eq.Medicina', order: 'created_at.desc' }, '*,turmas(nome),simulado_templates(nome)')
      .then(({ data }) => { setSimulados(data || []); setCarregando(false) })
  }, [perfil])

  return (
    <div style={{ paddingBottom: 80 }}>
      <Nav />

      <div style={{
        background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)',
        padding: '16px 20px', position: 'sticky', top: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Simulados</div>
          <div style={{ fontSize: 11, color: '#999' }}>Medicina</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/med/simulados/templates" style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'white', border: '1px solid rgba(0,0,0,0.12)',
            color: '#555', textDecoration: 'none',
            padding: '9px 14px', borderRadius: 10, fontSize: 13, fontWeight: 500,
            fontFamily: 'DM Sans, sans-serif',
          }}>
            <FileText size={14} /> Modelos
          </Link>
          <Link href="/med/simulados/novo" style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'var(--purple)', color: 'white', textDecoration: 'none',
            padding: '9px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
            fontFamily: 'DM Sans, sans-serif',
          }}>
            <Plus size={15} /> Novo
          </Link>
        </div>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {carregando ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#aaa', fontSize: 13 }}>Carregando...</div>
        ) : simulados.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📝</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Nenhum simulado ainda</div>
            <div style={{ fontSize: 13, color: '#aaa', marginBottom: 20 }}>
              Crie um modelo de prova e depois o primeiro simulado.
            </div>
            <Link href="/med/simulados/novo" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'var(--purple)', color: 'white', textDecoration: 'none',
              padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
              fontFamily: 'DM Sans, sans-serif',
            }}>
              <Plus size={14} /> Criar primeiro simulado
            </Link>
          </div>
        ) : simulados.map(s => {
          const cfg = STATUS_SIM[s.status] || STATUS_SIM.criado
          return (
            <Link key={s.id} href={`/med/simulados/${s.id}`} style={{ textDecoration: 'none' }}>
              <div style={{
                background: 'white', borderRadius: 14, padding: '14px 16px',
                border: '0.5px solid rgba(0,0,0,0.08)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>{s.nome}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}>
                      {cfg.label}
                    </span>
                    {s.simulado_templates?.nome && (
                      <span style={{ fontSize: 11, color: '#888' }}>{s.simulado_templates.nome}</span>
                    )}
                    {s.turmas?.nome && (
                      <span style={{ fontSize: 11, color: '#888' }}>{s.turmas.nome}</span>
                    )}
                    <span style={{ fontSize: 11, color: '#bbb' }}>
                      {new Date(s.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </span>
                  </div>
                </div>
                <ChevronRight size={18} color="#ccc" />
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
