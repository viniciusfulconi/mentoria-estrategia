'use client'
import { useEffect, useState } from 'react'
import { dbQuery, dbQueryAll } from '@/lib/supabase'
import { mediaFinalCiclo } from '@/lib/rankings'
import Nav from '@/components/Nav'
import PageLoader from '@/components/PageLoader'
import Link from 'next/link'
import { BarChart3, AlertTriangle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'

export default function Simulados() {
  const { perfil, loading: authLoading } = useAuth()
  const router = useRouter()
  const [alunos, setAlunos] = useState<any[]>([])
  const [ciclos, setCiclos] = useState<string[]>([])
  const [busca, setBusca] = useState('')
  const [filtroIngresso, setFiltroIngresso] = useState<'todos' | 'presencial' | 'pec'>('todos')
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [syncBanner, setSyncBanner] = useState<{ tipo: 'erro' | 'aviso'; texto: string } | null>(null)

  const isGestor = perfil?.papel === 'coordenador' || perfil?.papel === 'direcao'

  useEffect(() => {
    if (authLoading) return
    if (perfil?.papel === 'aluno') {
      router.replace(perfil.aluno_id ? `/aluno/${perfil.aluno_id}` : '/meu-perfil')
      return
    }
    load()
    if (isGestor) checarSync()
  }, [authLoading, perfil])

  // Dead man's switch: acende banner se a última sync OK for antiga (job morto)
  // ou se houver ciclo novo aguardando importação manual.
  async function checarSync() {
    try {
      const [{ data: ultima }, { data: sucesso }] = await Promise.all([
        dbQuery('sync_log', { order: 'executado_em.desc', limit: '1' }, 'status,executado_em,avisos'),
        dbQuery('sync_log', { status: 'in.(ok,skipped,ciclo_novo)', order: 'executado_em.desc', limit: '1' }, 'executado_em'),
      ])
      const ultOk = sucesso?.[0]?.executado_em ? new Date(sucesso[0].executado_em).getTime() : null
      const horas = ultOk ? (Date.now() - ultOk) / 3.6e6 : Infinity
      if (horas > 26) {
        setSyncBanner({ tipo: 'erro', texto: ultOk
          ? `Sincronização automática atrasada — última há ${Math.floor(horas)}h. Verifique o cron.`
          : 'Sincronização automática nunca rodou com sucesso. Verifique a configuração.' })
        return
      }
      const u = ultima?.[0]
      if (u?.status === 'erro') {
        setSyncBanner({ tipo: 'erro', texto: 'A última sincronização automática falhou. Veja os logs.' })
      } else if (u?.avisos?.ciclos_novos?.length) {
        setSyncBanner({ tipo: 'aviso', texto: `Ciclo(s) novo(s) na planilha: ${u.avisos.ciclos_novos.join(', ')}. Importe pela tela de Upload.` })
      }
    } catch { /* sync_log pode não existir ainda — silencioso */ }
  }

  async function load() {
    setErro(null)
    const [{ data, error }, { data: alunosDados }] = await Promise.all([
      dbQueryAll(
        'resultados',
        { 'fase': 'eq.ranking', 'order': 'ciclo_nome' },
        'id_aluno,nome_aluno,mentor,ciclo_nome,fase,resultado_ciclo,media_1fase,media_2fase'
      ),
      dbQuery('alunos_dados', {}, 'id_aluno,ingresso'),
    ])

    if (error) { setErro('Falha ao carregar alunos.'); setLoading(false); return }
    if (!data) { setLoading(false); return }

    // Mapa id_aluno → ingresso (NULL = presencial; 'PEC' = online)
    const ingressoMap: Record<string, string | null> = {}
    ;(alunosDados || []).forEach((a: any) => { ingressoMap[a.id_aluno] = a.ingresso })

    const alunoMap: Record<string, any> = {}
    const cicloSet = new Set<string>()
    data.forEach(r => {
      cicloSet.add(r.ciclo_nome)
      if (!alunoMap[r.id_aluno]) {
        alunoMap[r.id_aluno] = {
          id_aluno: r.id_aluno, nome: r.nome_aluno, mentor: r.mentor,
          ingresso: ingressoMap[r.id_aluno] ?? null,
          ciclos: {},
        }
      }
      alunoMap[r.id_aluno].ciclos[r.ciclo_nome] = r
    })

    setAlunos(Object.values(alunoMap).sort((a, b) => a.nome.localeCompare(b.nome)))
    setCiclos(Array.from(cicloSet).sort((a, b) =>
      parseInt(a.match(/\d+/)?.[0] || '0') - parseInt(b.match(/\d+/)?.[0] || '0')
    ))
    setLoading(false)
  }

  const filtrados = alunos.filter(a => {
    if (filtroIngresso === 'pec' && a.ingresso !== 'PEC') return false
    if (filtroIngresso === 'presencial' && a.ingresso === 'PEC') return false
    return a.nome.toLowerCase().includes(busca.toLowerCase()) || a.mentor?.toLowerCase().includes(busca.toLowerCase())
  })

  const contadores = {
    todos: alunos.length,
    presencial: alunos.filter(a => a.ingresso !== 'PEC').length,
    pec: alunos.filter(a => a.ingresso === 'PEC').length,
  }

  function mediaGeral(aluno: any) {
    const vals = Object.values(aluno.ciclos).map((c: any) => mediaFinalCiclo(c))
      .filter((v): v is number => v != null)
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
        {perfil?.papel === 'coordenador' && (
          <Link href="/simulados/upload" style={{ textDecoration: 'none', background: '#f97316', color: 'white', borderRadius: 10, padding: '7px 14px', fontSize: 13, fontWeight: 500 }}>↑ Upload</Link>
        )}
      </div>

      {syncBanner && (
        <Link href="/simulados/upload" style={{ textDecoration: 'none' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', fontSize: 12, fontWeight: 500,
            background: syncBanner.tipo === 'erro' ? '#FEF2F2' : '#FFFBEB',
            color: syncBanner.tipo === 'erro' ? '#991B1B' : '#78350F',
            borderBottom: `0.5px solid ${syncBanner.tipo === 'erro' ? 'rgba(220,38,38,0.2)' : 'rgba(217,119,6,0.2)'}`,
          }}>
            <AlertTriangle size={14} strokeWidth={2} />
            {syncBanner.texto}
          </div>
        </Link>
      )}

      <div style={{ padding: '10px 16px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar aluno ou mentor..." style={{ margin: 0 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          {([
            ['todos',      'Todos',      contadores.todos],
            ['presencial', 'Presencial', contadores.presencial],
            ['pec',        'PEC',        contadores.pec],
          ] as const).map(([v, l, n]) => (
            <button key={v} onClick={() => setFiltroIngresso(v)} style={{
              padding: '5px 12px', borderRadius: 16, fontSize: 11, border: 'none',
              background: filtroIngresso === v ? '#1a1a1a' : '#F1F5F9',
              color: filtroIngresso === v ? 'white' : '#666',
              cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              {l}
              <span style={{
                fontSize: 10, padding: '1px 7px', borderRadius: 10,
                background: filtroIngresso === v ? 'rgba(255,255,255,0.2)' : '#E2E8F0',
                color: filtroIngresso === v ? 'white' : '#64748B',
                fontWeight: 600,
              }}>{n}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>Carregando...</div>
        ) : erro ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 13, color: '#DC2626', marginBottom: 12 }}>{erro}</div>
            <button onClick={load} style={{ padding: '8px 20px', borderRadius: 10, background: '#f97316', color: 'white', border: 'none', fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Tentar novamente</button>
          </div>
        ) : filtrados.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', color: '#999', padding: 40 }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}><BarChart3 size={36} strokeWidth={1.5} color="#CBD5E1" /></div>
            <div style={{ marginBottom: 12 }}>Nenhum dado ainda.</div>
            {perfil?.papel === 'coordenador' && (
              <Link href="/simulados/upload" style={{ textDecoration: 'none', display: 'inline-block', background: '#f97316', color: 'white', borderRadius: 12, padding: '10px 20px', fontSize: 14 }}>Importar planilha</Link>
            )}
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
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#1E40AF', flexShrink: 0 }}>
                    {a.nome.split(' ').map((w: string) => w[0]).slice(0, 2).join('')}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#1a1a1a' }}>{a.nome}</div>
                      {a.ingresso === 'PEC' && (
                        <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 6, background: '#F3F0FF', color: '#5B21B6' }}>
                          PEC
                        </span>
                      )}
                    </div>
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
                  {reprovados > 0 && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#FFFBEB', color: '#78350F', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={10} strokeWidth={2} />{reprovados} reprovaç{reprovados > 1 ? 'ões' : 'ão'}</span>}
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
