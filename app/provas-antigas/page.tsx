'use client'
import { useEffect, useState } from 'react'
import { dbQuery } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import Nav from '@/components/Nav'
import Link from 'next/link'
import { FileText } from 'lucide-react'

const TIPO_LABEL: Record<string, string> = { ime: 'IME', ita: 'ITA' }
const FASE_LABEL: Record<number, string> = { 1: '1ª Fase', 2: '2ª Fase' }
const MODELO_LABEL: Record<string, string> = { multipla_escolha: 'Múltipla escolha', discursiva: 'Discursiva' }

export default function ProvasAntigas() {
  const { perfil } = useAuth()
  const [provas, setProvas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setErro(null)
    const { data, error } = await dbQuery('provas_antigas', { order: 'created_at.desc' })
    if (error) { setErro(error); setLoading(false); return }
    setProvas(data || [])
    setLoading(false)
  }

  const isCoordenador = perfil?.papel === 'coordenador'

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Provas Antigas</div>
        {isCoordenador && (
          <Link href="/provas-antigas/nova" style={{ textDecoration: 'none', background: '#f97316', color: 'white', borderRadius: 10, padding: '7px 14px', fontSize: 13, fontWeight: 500 }}>
            + Nova prova
          </Link>
        )}
      </div>

      <div style={{ padding: 16 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>Carregando...</div>
        ) : erro ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 13, color: '#DC2626', marginBottom: 12 }}>{erro}</div>
            <button onClick={load} style={{ padding: '8px 20px', borderRadius: 10, background: '#f97316', color: 'white', border: 'none', fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Tentar novamente</button>
          </div>
        ) : provas.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', color: '#999', padding: 40 }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}><FileText size={36} strokeWidth={1.5} color="#CBD5E1" /></div>
            <div style={{ marginBottom: 12 }}>Nenhuma prova cadastrada ainda.</div>
            {isCoordenador && (
              <Link href="/provas-antigas/nova" style={{ textDecoration: 'none', display: 'inline-block', background: '#f97316', color: 'white', borderRadius: 12, padding: '10px 20px', fontSize: 14 }}>
                Cadastrar primeira prova
              </Link>
            )}
          </div>
        ) : provas.map(p => (
          <div key={p.id} className="card" style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#F3F0FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FileText size={18} strokeWidth={2} color="#f97316" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#1a1a1a', marginBottom: 4 }}>{p.nome}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#EDE9FE', color: '#5B21B6', fontWeight: 600 }}>
                    {TIPO_LABEL[p.tipo] || p.tipo}
                  </span>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#F1F5F9', color: '#475569', fontWeight: 500 }}>
                    {FASE_LABEL[p.fase] || `Fase ${p.fase}`}
                  </span>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#F1F5F9', color: '#475569', fontWeight: 500 }}>
                    {p.num_questoes} questões
                  </span>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#F1F5F9', color: '#475569', fontWeight: 500 }}>
                    {MODELO_LABEL[p.modelo] || p.modelo}
                  </span>
                </div>
              </div>
              {p.pdf_url && (
                <a href={p.pdf_url} target="_blank" rel="noreferrer" style={{ flexShrink: 0, fontSize: 11, color: '#f97316', textDecoration: 'none', padding: '4px 8px', border: '0.5px solid #f97316', borderRadius: 8 }}>
                  PDF
                </a>
              )}
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: '#999' }}>
              Cadastrada em {new Date(p.created_at).toLocaleDateString('pt-BR')}
            </div>
          </div>
        ))}
      </div>
      <Nav />
    </div>
  )
}
