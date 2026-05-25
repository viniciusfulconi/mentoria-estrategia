'use client'
import { useEffect, useState } from 'react'
import { dbQuery } from '@/lib/supabase'
import Nav from '@/components/Nav'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { X, PlayCircle, FileText, ExternalLink } from 'lucide-react'

export default function Aulas() {
  const { perfil } = useAuth()
  const [aulas, setAulas] = useState<any[]>([])
  const [filtro, setFiltro] = useState('todas')
  const [loading, setLoading] = useState(true)
  const [playerAula, setPlayerAula] = useState<any>(null)
  const [pdfAberto, setPdfAberto] = useState(false)

  useEffect(() => {
    dbQuery('aulas', { order: 'created_at.desc' })
      .then(({ data }) => { setAulas(data || []); setLoading(false) })
  }, [])

  const filtros = ['todas', 'Física', 'Matemática', 'Química', 'Português', 'Redação', 'Mentoria']
  const aulasFiltradas = filtro === 'todas' ? aulas : aulas.filter(a => a.materia === filtro)
  const isCoordenador = perfil?.papel === 'coordenador'

  function ytThumb(id: string) { return `https://img.youtube.com/vi/${id}/mqdefault.jpg` }

  function tipoAula(a: any): 'video' | 'video_pdf' | 'pdf' {
    if (a.youtube_id && a.pdf_url) return 'video_pdf'
    if (a.pdf_url) return 'pdf'
    return 'video'
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Aulas</div>
        {isCoordenador && (
          <Link href="/aulas/nova" style={{ textDecoration: 'none', background: '#2563EB', color: 'white', borderRadius: 10, padding: '7px 14px', fontSize: 13, fontWeight: 500 }}>+ Nova</Link>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '10px 16px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
        {filtros.map(f => (
          <button key={f} onClick={() => setFiltro(f)} style={{
            padding: '5px 12px', borderRadius: 20, fontSize: 12, border: '0.5px solid rgba(0,0,0,0.12)',
            background: filtro === f ? '#2563EB' : 'transparent', color: filtro === f ? 'white' : '#666',
            cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'DM Sans,sans-serif'
          }}>{f === 'todas' ? 'Todas' : f}</button>
        ))}
      </div>

      <div style={{ padding: 16 }}>
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="skeleton" style={{ height: 88 }} />
                <div style={{ padding: '8px 10px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="skeleton" style={{ height: 12, width: '85%' }} />
                  <div className="skeleton" style={{ height: 10, width: '50%' }} />
                </div>
              </div>
            ))}
          </div>
        ) : aulasFiltradas.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', color: '#999', padding: 40 }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
              <PlayCircle size={36} strokeWidth={1.5} color="#CBD5E1" />
            </div>
            <div>Nenhuma aula encontrada.</div>
            {isCoordenador && (
              <Link href="/aulas/nova" style={{ textDecoration: 'none', display: 'inline-block', marginTop: 14, background: '#2563EB', color: 'white', borderRadius: 12, padding: '10px 20px', fontSize: 14 }}>Adicionar aula</Link>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {aulasFiltradas.map((a: any) => {
              const tipo = tipoAula(a)
              return (
                <div key={a.id} onClick={() => setPlayerAula(a)} style={{ cursor: 'pointer' }}>
                  <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ position: 'relative', background: '#0f0f1a', height: 88, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {/* Imagem de capa: customizada > YouTube > fundo escuro */}
                      {a.imagem_url ? (
                        <img src={a.imagem_url} alt={a.titulo} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
                      ) : tipo !== 'pdf' ? (
                        <img src={ytThumb(a.youtube_id)} alt={a.titulo} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85, position: 'absolute', inset: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      ) : (
                        <div style={{ position: 'absolute', inset: 0, background: '#F3F0FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <FileText size={32} color="#7C3AED" strokeWidth={1.5} />
                        </div>
                      )}
                      {/* Ícone de play sobre vídeo */}
                      {tipo !== 'pdf' && (
                        <div style={{ position: 'relative', width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <PlayCircle size={18} color="#2563EB" strokeWidth={2} />
                        </div>
                      )}
                      {tipo === 'video_pdf' && (
                        <span style={{ position: 'absolute', bottom: 6, right: 6, background: '#7C3AED', color: 'white', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 6 }}>+ PDF</span>
                      )}
                      {tipo === 'pdf' && (
                        <span style={{ position: 'absolute', top: 6, right: 6, background: '#7C3AED', color: 'white', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 6 }}>PDF</span>
                      )}
                    </div>
                    <div style={{ padding: '8px 10px 10px' }}>
                      <div style={{ fontSize: 11, fontWeight: 500, color: '#1a1a1a', lineHeight: 1.4, marginBottom: 4 }}>{a.titulo}</div>
                      <div style={{ fontSize: 10, color: '#999' }}>{a.materia}{a.duracao && a.duracao !== '—' ? ` · ${a.duracao}` : ''}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {playerAula && (
        <div
          onClick={() => { setPlayerAula(null); setPdfAberto(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: 16, overflowY: 'auto' }}
        >
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 680, paddingTop: 8, paddingBottom: 24 }}>
            {/* Cabeçalho */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'white', lineHeight: 1.4 }}>{playerAula.titulo}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>
                  {playerAula.materia}{playerAula.duracao && playerAula.duracao !== '—' ? ` · ${playerAula.duracao}` : ''}
                </div>
              </div>
              <button onClick={() => { setPlayerAula(null); setPdfAberto(false) }} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 8, padding: 8, cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <X size={18} strokeWidth={2} />
              </button>
            </div>

            {/* Vídeo */}
            {playerAula.youtube_id && (
              <>
                <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', borderRadius: 14, overflow: 'hidden', background: '#000' }}>
                  <iframe
                    src={`https://www.youtube.com/embed/${playerAula.youtube_id}?autoplay=1&rel=0`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                  />
                </div>
                <a
                  href={playerAula.youtube_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.35)', textDecoration: 'none' }}
                >
                  Abrir no YouTube ↗
                </a>
              </>
            )}

            {/* Seção PDF */}
            {playerAula.pdf_url && (
              <div style={{ marginTop: playerAula.youtube_id ? 16 : 0 }}>
                {/* Barra de controle do PDF */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: pdfAberto ? 8 : 0 }}>
                  <button
                    onClick={() => setPdfAberto(v => !v)}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', gap: 10,
                      background: pdfAberto ? 'rgba(124,58,237,0.25)' : 'rgba(124,58,237,0.15)',
                      border: `1px solid ${pdfAberto ? 'rgba(124,58,237,0.6)' : 'rgba(124,58,237,0.35)'}`,
                      borderRadius: pdfAberto ? '12px 12px 0 0' : 12,
                      padding: '12px 14px', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(124,58,237,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <FileText size={17} color="#A78BFA" strokeWidth={1.5} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>Material em PDF</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 1 }}>
                        {pdfAberto ? 'Clique para fechar' : 'Clique para visualizar'}
                      </div>
                    </div>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 16, transition: 'transform 0.2s', display: 'inline-block', transform: pdfAberto ? 'rotate(180deg)' : 'none' }}>▾</span>
                  </button>
                  <a
                    href={playerAula.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    style={{ marginLeft: 8, padding: '12px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    title="Abrir em nova aba"
                  >
                    <ExternalLink size={15} color="rgba(255,255,255,0.5)" strokeWidth={1.5} />
                  </a>
                </div>

                {/* Viewer inline */}
                {pdfAberto && (
                  <iframe
                    src={playerAula.pdf_url}
                    style={{
                      width: '100%', height: '72vh',
                      border: '1px solid rgba(124,58,237,0.35)',
                      borderTop: 'none',
                      borderRadius: '0 0 12px 12px',
                      background: '#fff',
                    }}
                    title="PDF viewer"
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <Nav />
    </div>
  )
}
