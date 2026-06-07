'use client'
import { useEffect, useState } from 'react'
import { dbQuery } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Nav from '@/components/Nav'
import Link from 'next/link'
import { Plus, ChevronRight } from 'lucide-react'

type Template = {
  id: string
  nome: string
  fases: any[]
  formula_katex: string | null
  created_at: string
}

export default function TemplatesList() {
  const router = useRouter()
  const { perfil } = useAuth()
  const [templates, setTemplates] = useState<Template[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    if (perfil && perfil.papel !== 'coordenador' && perfil.papel !== 'direcao') { router.replace('/'); return }
    dbQuery<Template>('simulado_templates', { vertical: 'eq.Medicina', order: 'created_at.desc' }).then(({ data }) => {
      setTemplates(data || [])
      setCarregando(false)
    })
  }, [perfil])

  function resumoTemplate(t: Template) {
    const fases = t.fases || []
    const totalQuestoes = fases.reduce((acc: number, f: any) =>
      acc + (f.dias || []).reduce((a: number, d: any) =>
        a + (d.materias || []).reduce((b: number, m: any) => b + (m.qtd_questoes || 0), 0), 0), 0)
    return { numFases: fases.length, totalQuestoes }
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <Nav />

      <div style={{
        background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)',
        padding: '16px 20px', position: 'sticky', top: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Modelos de prova</div>
          <div style={{ fontSize: 11, color: '#999' }}>Medicina</div>
        </div>
        <Link href="/med/simulados/templates/novo" style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--purple)', color: 'white', textDecoration: 'none',
          padding: '9px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          fontFamily: 'DM Sans, sans-serif',
        }}>
          <Plus size={15} /> Novo modelo
        </Link>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {carregando ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#aaa', fontSize: 13 }}>Carregando...</div>
        ) : templates.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Nenhum modelo criado</div>
            <div style={{ fontSize: 13, color: '#aaa', marginBottom: 20 }}>Crie o primeiro modelo de prova para usar nos simulados.</div>
            <Link href="/med/simulados/templates/novo" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'var(--purple)', color: 'white', textDecoration: 'none',
              padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
              fontFamily: 'DM Sans, sans-serif',
            }}>
              <Plus size={14} /> Criar primeiro modelo
            </Link>
          </div>
        ) : templates.map(t => {
          const { numFases, totalQuestoes } = resumoTemplate(t)
          return (
            <div key={t.id} style={{
              background: 'white', borderRadius: 14, padding: '14px 16px',
              border: '0.5px solid rgba(0,0,0,0.08)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 42, height: 42, borderRadius: 10, background: 'var(--purple-light)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                fontSize: 18,
              }}>
                📋
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{t.nome}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: '#888' }}>
                    {numFases} {numFases === 1 ? 'fase' : 'fases'}
                  </span>
                  <span style={{ fontSize: 11, color: '#888' }}>·</span>
                  <span style={{ fontSize: 11, color: '#888' }}>
                    {totalQuestoes} questões/simulado
                  </span>
                  {t.formula_katex && (
                    <>
                      <span style={{ fontSize: 11, color: '#888' }}>·</span>
                      <span style={{ fontSize: 11, color: '#888' }}>fórmula definida</span>
                    </>
                  )}
                </div>
              </div>
              <ChevronRight size={18} color="#ccc" />
            </div>
          )
        })}
      </div>
    </div>
  )
}
