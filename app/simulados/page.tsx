'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Nav from '@/components/Nav'
import PageLoader from '@/components/PageLoader'
import Link from 'next/link'

export default function Simulados() {
  const [alunos, setAlunos] = useState<any[]>([])
  const [ciclos, setCiclos] = useState<string[]>([])
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('resultados')
        .select('id_aluno, nome_aluno, mentor, ciclo_nome, fase, resultado_ciclo, media_1fase, media_2fase')
        .eq('fase', 'ranking')
        .order('ciclo_nome')

      if (!data) { setLoading(false); return }

      // Agrupa por aluno
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
      setCiclos(Array.from(cicloSet).sort())
      setLoading(false)
    }
    load()
  }, [])

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
    if (reprovados > 0) return '#E24B4A'
    return '#1D9E75'
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Alunos</div>
        <Link href="/simulados/upload" style={{ textDecoration: 'none', background: '#534AB7', color: 'white', borderRadius: 10, padding: '7px 14px', fontSize: 13, fontWeight: 500 }}>↑ Upload</Link>
      </div>

      <div style={{ padding: '10px 16px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar aluno ou mentor..." style={{ margin: 0 }} />
      </div>

      <div style={{ padding: 16 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>Carregando...</div>
        ) : filtrados.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', color: '#999', padding: 40 }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📊</div>
            <div style={{ marginBottom: 12 }}>Nenhum dado ainda.</div>
            <Link href="/simulados/upload" style={{ textDecoration: 'none', display: 'inline-block', background: '#534AB7', color: 'white', borderRadius: 12, padding: '10px 20px', fontSize: 14 }}>Importar planilha</Link>
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
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#EEEDFE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#3C3489', flexShrink: 0 }}>
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
                      background: c.resultado_ciclo === 'Aprovado' ? '#EAF3DE' : c.resultado_ciclo === 'Reprovado' ? '#FCEBEB' : '#F1EFE8',
                      color: c.resultado_ciclo === 'Aprovado' ? '#27500A' : c.resultado_ciclo === 'Reprovado' ? '#791F1F' : '#5F5E5A'
                    }}>
                      {c.ciclo_nome.replace('Ciclo ', 'C').replace(' - ITA', '').replace(' - IME', '')}
                    </span>
                  ))}
                  {reprovados > 0 && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#FAEEDA', color: '#633806', fontWeight: 500 }}>⚠ {reprovados} reprovação{reprovados > 1 ? 'ões' : ''}</span>}
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
