'use client'
import { useEffect, useState } from 'react'
import { dbQuery } from '@/lib/supabase'
import Nav from '@/components/Nav'
import PageLoader from '@/components/PageLoader'
import Link from 'next/link'

export default function Simulados() {
  const [alunos, setAlunos] = useState<any[]>([])
  const [ciclos, setCiclos] = useState<string[]>([])
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setErro(null)
    const { data, error } = await dbQuery(
      'resultados',
      { 'fase': 'eq.ranking', 'order': 'ciclo_nome' },
      'id_aluno,nome_aluno,mentor,ciclo_nome,fase,resultado_ciclo,media_1fase,media_2fase'
    )

    if (error) { setErro('Falha ao carregar alunos.'); setLoading(false); return }
    if (!data) { setLoading(false); return }

    const alunoMap: Record<string, any> = {}
    const cicloSet = new Set<string>()
    data.forEach(r => {
      cicloSet.add(r.ciclo_nome)
      if (!alunoMap[r.id_aluno]) {
        alunoMap[r.id_aluno] = { id_aluno: r.id_aluno, nome: r.nome_aluno, mentor: r.mentor, ciclos: {} }
      }
      alunoMap[r.id_aluno].ciclos[r.ciclo_nome] = r
    })

    setAlunos(Object.values(alunoMap).sort((a, b) => a.nome.localeCompare(b.nome)))
    setCiclos(Array.from(cicloSet).sort((a, b) =>
      parseInt(a.match(/\d+/)?.[0] || '0') - parseInt(b.match(/\d+/)?.[0] || '0')
    ))
    setLoading(false)
  }

  const filtrados = alunos.filter(a => a.nome.toLowerCase().includes(busca.toLowerCase()) || a.mentor?.toLowerCase().includes(busca.toLowerCase()))

  function mediaGeral(aluno: any) {
    const vals = Object.values(aluno.ciclos).map((c: any) => {
      const m1 = Number(c.media_1fase || 0)
      const m2 = Number(c.media_2fase || 0)
      if (m1 && m2) return (m1 + m2) / 2
      return m1 || m2
    }).filter(Boolean) as number[]
    if (!vals.length) return null
    return vals.reduce((a, b) => a + b, 0) / vals.length
  }

  function statusColor(aluno: any) {
    const ciclosArr = Object.values(aluno.ciclos) as any[]
    const reprovados = ciclosArr.filter(c => c.resultado_ciclo === 'Reprovado').length
    if (reprovados > 0) return '#DC2626'
    return '#16A34A'
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Alunos</div>
        <Link href="/simulados/upload" style={{ textDecoration: 'none', background: '#2563EB', color: 'white', borderRadius: 10, padding: '7px 14px', fontSize: 13, fontWeight: 500 }}>↑ Upload</Link>
      </div>

      <div style={{ padding: '10px 16px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar aluno ou mentor..." style={{ margin: 0 }} />
      </div>

      <div style={{ padding: 16 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>Carregando...</div>
        ) : erro ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 13, color: '#DC2626', marginBottom: 12 }}>{erro}</div>
            <button onClick={load} style={{ padding: '8px 20px', borderRadius: 10, background: '#2563EB', color: 'white', border: 'none', fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Tentar novamente</button>
          </div>
        ) : filtrados.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', color: '#999', padding: 40 }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📊</div>
            <div style={{ marginBottom: 12 }}>Nenhum dado ainda.</div>
            <Link href="/simulados/upload" style={{ textDecoration: 'none', display: 'inline-block', background: '#2563EB', color: 'white', borderRadius: 12, padding: '10px 20px', fontSize: 14 }}>Importar planilha</Link>
          </div>
        ) : filtrados.map(a => {
          const media = mediaGeral(a)
          const cor = statusColor(a)
          const ciclosArr = Object.values(a.ciclos) as any[]
          const reprovados = ciclosArr.filter((c: any) => c.resultado_ciclo === 'Reprovado').length
          return (
            <Link key={a.id_aluno} href={`/aluno/${a.id_aluno}`} style={{ textDecoration: 'none' }}>
              <div className="card" style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#1E40AF', flexShrink: 0 }}>
                    {a.nome.split(' ').map((w: string) => w[0]).slice(0, 2).join('')}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#1a1a1a' }}>{a.nome}</div>
                    <div style={{ fontSize: 11, color: '#999' }}>{a.mentor}</div>
                  </div>
                  {media !== null && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 18, fontWeight: 600, color: cor }}>{media.toFixed(1)}</div>
                      <div style={{ fontSize: 10, color: '#999' }}>média</div>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {ciclosArr.map((c: any) => (
                    <span key={c.ciclo_nome} style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 500,
                      background: c.resultado_ciclo === 'Aprovado' ? '#DCFCE7' : c.resultado_ciclo === 'Reprovado' ? '#FEF2F2' : '#F1F5F9',
                      color: c.resultado_ciclo === 'Aprovado' ? '#14532D' : c.resultado_ciclo === 'Reprovado' ? '#991B1B' : '#5F5E5A'
                    }}>
                      {c.ciclo_nome.replace('Ciclo ', 'C').replace(' - ITA', '').replace(' - IME', '')}
                    </span>
                  ))}
                  {reprovados > 0 && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#FFFBEB', color: '#78350F', fontWeight: 500 }}>⚠ {reprovados} reprovação{reprovados > 1 ? 'ões' : ''}</span>}
                </div>
              </div>
            </Link>
          )
        })}
      </div>
      <Nav />
    </div>
  )
}
