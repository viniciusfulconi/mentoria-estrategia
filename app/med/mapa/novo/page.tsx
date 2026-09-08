'use client'
import { useEffect, useState } from 'react'
import { dbQuery, dbInsert } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { carregarAlunos, type AlunoBasico } from '@/lib/alunos'
import Nav from '@/components/Nav'
import { ArrowLeft, Search } from 'lucide-react'

export default function NovoMapa() {
  const router = useRouter()
  const { perfil } = useAuth()
  const [alunos, setAlunos] = useState<AlunoBasico[]>([])
  const [busca, setBusca] = useState('')
  const [criando, setCriando] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!perfil) return
    if (!['coordenador', 'direcao', 'mentor'].includes(perfil.papel)) { router.replace('/'); return }
    carregarAlunos('Medicina', perfil).then(setAlunos)
  }, [perfil])

  async function criar(aluno: AlunoBasico) {
    if (criando) return
    setCriando(aluno.id); setErro('')

    // Um rascunho aberto por aluno: reaproveita em vez de duplicar.
    const { data: existente } = await dbQuery('mapas_revisao', {
      aluno_id: `eq.${aluno.id}`, status: 'eq.rascunho', limit: '1',
    }, 'id')
    if (existente?.[0]) { router.push(`/med/mapa/${existente[0].id}`); return }

    const nomeRef = perfil?.mentor_nome || perfil?.nome || ''
    const { data: m } = await dbQuery('mentores', { nome: `eq.${nomeRef}` }, 'id')

    const { data, error } = await dbInsert('mapas_revisao', {
      aluno_id: aluno.id,
      aluno_nome: aluno.nome,
      mentor_id: m?.[0]?.id || null,
      mentor_nome: nomeRef,
      vertical: 'Medicina',
      status: 'rascunho',
    }, true)

    if (error || !data?.[0]) { setErro(error || 'Falha ao criar o mapa.'); setCriando(''); return }
    router.push(`/med/mapa/${data[0].id}`)
  }

  const filtrados = alunos.filter(a => a.nome?.toLowerCase().includes(busca.toLowerCase()))

  return (
    <div style={{ paddingBottom: 80 }}>
      <Nav />
      <div style={{
        background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px 20px',
        position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <ArrowLeft size={19} />
        </button>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Novo mapa de revisão</div>
          <div style={{ fontSize: 11, color: '#999' }}>Escolha o aluno</div>
        </div>
      </div>

      <div style={{ padding: 16, maxWidth: 640, margin: '0 auto' }}>
        {erro && (
          <div style={{ background: 'var(--red-light)', color: '#991b1b', padding: '10px 13px', borderRadius: 10, fontSize: 13, marginBottom: 12 }}>
            {erro}
          </div>
        )}

        <div style={{ position: 'relative', marginBottom: 12 }}>
          <Search size={15} color="var(--text-hint)" style={{ position: 'absolute', left: 12, top: 12 }} />
          <input
            value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar aluno…"
            style={{
              width: '100%', padding: '10px 12px 10px 34px', borderRadius: 10,
              border: '1px solid var(--border-strong)', fontSize: 14, background: 'white',
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtrados.length === 0 ? (
            <div style={{ color: 'var(--text-hint)', fontSize: 13, padding: 20, textAlign: 'center' }}>
              Nenhum aluno encontrado.
            </div>
          ) : filtrados.map(a => (
            <button key={a.id} onClick={() => criar(a)} disabled={!!criando} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'white', border: '1px solid var(--border)', borderRadius: 11,
              padding: '12px 14px', fontSize: 14, textAlign: 'left',
              cursor: criando ? 'wait' : 'pointer', opacity: criando && criando !== a.id ? 0.5 : 1,
            }}>
              <span style={{ fontWeight: 500 }}>{a.nome}</span>
              {criando === a.id && <span style={{ fontSize: 12, color: 'var(--text-hint)' }}>abrindo…</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
