'use client'
import { useEffect, useState } from 'react'
import { dbQuery, dbUpdate } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import Nav from '@/components/Nav'
import { useRouter } from 'next/navigation'

export default function Admin() {
  const { perfil } = useAuth()
  const router = useRouter()
  const [pendentes, setPendentes] = useState<any[]>([])
  const [aprovados, setAprovados] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (perfil && perfil.papel !== 'coordenador' && perfil.papel !== 'direcao') router.push('/')
    load()
  }, [perfil])

  const isDirecao = perfil?.papel === 'direcao'

  async function load() {
    const { data } = await dbQuery('perfis', { order: 'created_at.desc' })
    setPendentes((data || []).filter((p: any) => p.status === 'pendente'))
    setAprovados((data || []).filter((p: any) => p.status === 'aprovado'))
    setLoading(false)
  }

  async function aprovar(id: string) {
    await dbUpdate('perfis', { id: `eq.${id}` }, { status: 'aprovado' })
    load()
  }

  async function bloquear(id: string) {
    await dbUpdate('perfis', { id: `eq.${id}` }, { status: 'bloqueado' })
    load()
  }

  async function alterarPapel(id: string, novoPapel: string) {
    await dbUpdate('perfis', { id: `eq.${id}` }, { papel: novoPapel })
    load()
  }

  const papelLabel = (p: string) => p === 'mentor' ? '◉ Mentor' : p === 'aluno' ? '◎ Aluno' : p === 'direcao' ? '◈ Direção' : p === 'professor' ? '◆ Professor' : '⬡ Coord.'
  const papelCor = (p: string) => p === 'mentor' ? '#2563EB' : p === 'aluno' ? '#16A34A' : p === 'direcao' ? '#0891B2' : p === 'professor' ? '#7C3AED' : '#D97706'

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Gerenciar acessos</div>
        {pendentes.length > 0 && <span style={{ background: '#FEF2F2', color: '#991B1B', fontSize: 11, padding: '3px 10px', borderRadius: 10, fontWeight: 500 }}>{pendentes.length} pendente{pendentes.length > 1 ? 's' : ''}</span>}
      </div>

      <div style={{ padding: 16 }}>
        {loading ? <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>Carregando...</div> : (
          <>
            {pendentes.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Aguardando aprovação</div>
                {pendentes.map(p => (
                  <div key={p.id} className="card" style={{ marginBottom: 10, borderLeft: '3px solid #D97706' }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{p.nome}</div>
                    <div style={{ fontSize: 12, color: '#999', marginBottom: 2 }}>{p.email}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <select
                        defaultValue={p.papel}
                        onChange={e => alterarPapel(p.id, e.target.value)}
                        style={{
                          fontSize: 11, fontWeight: 500, color: papelCor(p.papel),
                          border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 8,
                          padding: '4px 6px', background: '#F7F6F3',
                          fontFamily: 'DM Sans, sans-serif', cursor: 'pointer',
                        }}
                      >
                        <option value="coordenador">⬡ Coord.</option>
                        <option value="direcao">◈ Direção</option>
                        <option value="mentor">◉ Mentor</option>
                        <option value="professor">◆ Professor</option>
                        <option value="aluno">◎ Aluno</option>
                      </select>
                      {p.mentor_nome && <span style={{ fontSize: 11, color: '#999' }}>{p.mentor_nome}</span>}
                    </div>
                    {!isDirecao && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => aprovar(p.id)} style={{ flex: 1, padding: '8px', borderRadius: 10, border: 'none', background: '#16A34A', color: 'white', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>✓ Aprovar</button>
                        <button onClick={() => bloquear(p.id)} style={{ flex: 1, padding: '8px', borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.12)', background: 'transparent', color: '#DC2626', fontSize: 13, cursor: 'pointer' }}>✗ Recusar</button>
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}

            <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, marginTop: pendentes.length ? 20 : 0 }}>Usuários aprovados ({aprovados.length})</div>
            {aprovados.map(p => (
              <div key={p.id} className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#1E40AF', flexShrink: 0 }}>
                  {p.nome.split(' ').map((w: string) => w[0]).slice(0, 2).join('')}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{p.nome}</div>
                  <div style={{ fontSize: 11, color: '#999' }}>{p.email}</div>
                </div>
                {isDirecao ? (
                  <span style={{ fontSize: 10, color: papelCor(p.papel), fontWeight: 500 }}>{papelLabel(p.papel)}</span>
                ) : (
                  <select
                    value={p.papel}
                    onChange={e => alterarPapel(p.id, e.target.value)}
                    style={{
                      fontSize: 11, fontWeight: 500, color: papelCor(p.papel),
                      border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 8,
                      padding: '4px 6px', background: '#F7F6F3',
                      fontFamily: 'DM Sans, sans-serif', cursor: 'pointer',
                    }}
                  >
                    <option value="coordenador">⬡ Coord.</option>
                    <option value="direcao">◈ Direção</option>
                    <option value="mentor">◉ Mentor</option>
                    <option value="professor">◆ Professor</option>
                    <option value="aluno">◎ Aluno</option>
                  </select>
                )}
              </div>
            ))}
          </>
        )}
      </div>
      <Nav />
    </div>
  )
}
