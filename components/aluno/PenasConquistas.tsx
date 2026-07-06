'use client'
import { useEffect, useState } from 'react'
import { dbQuery } from '@/lib/supabase'
import { Feather, Trophy, Star, Swords } from 'lucide-react'

interface Props {
  authUserId: string          // perfil.id — UUID do auth
  // Posições por ciclo vindas da RPC posicoes_aluno — calculadas no banco porque
  // o RLS não deixa o aluno ler os rankings dos colegas para computar aqui.
  posicoesCiclo: { ciclo: string; pos: number; total: number }[]
}

type Conquista = {
  tipo: 'desafio' | 'ranking'
  titulo: string
  detalhe: string
  penas: number
  data: string
}

function calcPenas(posicao: number) {
  return Math.max(1, Math.ceil(100 / posicao))
}

export default function PenasConquistas({ authUserId, posicoesCiclo }: Props) {
  const [saldo, setSaldo]         = useState<number | null>(null)
  const [conquistas, setConquistas] = useState<Conquista[]>([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    if (!authUserId) return
    load()
    // .length (e não a referência) porque o pai cria novo array a cada render
  }, [authUserId, posicoesCiclo.length])

  async function load() {
    const [{ data: saldoData }, { data: respostas }] = await Promise.all([
      dbQuery('moedas_saldo', { aluno_id: `eq.${authUserId}` }, 'saldo'),
      dbQuery(
        'desafios_respostas',
        { aluno_id: `eq.${authUserId}`, validado: 'eq.true' },
        'desafio_id,criado_em'
      ),
    ])

    setSaldo(saldoData?.[0]?.saldo ?? 0)

    const lista: Conquista[] = []

    // ── Conquistas de desafio ──────────────────────────────────────
    if (respostas && respostas.length > 0) {
      const ids = respostas.map((r: any) => r.desafio_id).join(',')
      const { data: desafios } = await dbQuery(
        'desafios',
        { id: `in.(${ids})` },
        'id,titulo,recompensa,inicio'
      )
      const desafioMap = new Map((desafios || []).map((d: any) => [d.id, d]))
      for (const r of respostas as any[]) {
        const d = desafioMap.get(r.desafio_id)
        if (!d) continue
        lista.push({
          tipo:   'desafio',
          titulo: d.titulo,
          detalhe: 'Desafio semanal concluído',
          penas:  d.recompensa,
          data:   r.criado_em,
        })
      }
    }

    // ── Conquistas de ranking por ciclo (posições já vêm da RPC) ──
    for (const { ciclo, pos } of posicoesCiclo) {
      lista.push({
        tipo:    'ranking',
        titulo:  ciclo,
        detalhe: `${pos}º lugar`,
        penas:   calcPenas(pos),
        data:    '',
      })
    }

    // Ordena: rankings mais recentes primeiro, desafios depois
    lista.sort((a, b) => {
      if (a.tipo !== b.tipo) return a.tipo === 'ranking' ? -1 : 1
      return b.data.localeCompare(a.data)
    })

    setConquistas(lista)
    setLoading(false)
  }

  const totalCalculado = conquistas.reduce((acc, c) => acc + c.penas, 0)

  if (loading) return null

  return (
    <div style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
      {/* Header com saldo */}
      <div style={{
        background: 'linear-gradient(135deg, #0f2554 0%, #1e3a8a 100%)',
        padding: '18px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
            Seu saldo
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Feather size={22} color="#f97316" strokeWidth={2.5} />
            <span style={{ fontSize: 32, fontWeight: 800, color: 'white', letterSpacing: '-1px' }}>
              {saldo ?? 0}
            </span>
            <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', fontWeight: 500, marginTop: 6 }}>penas</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>Total ganho</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fb923c' }}>+{totalCalculado}</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{conquistas.length} conquistas</div>
        </div>
      </div>

      {/* Lista de conquistas */}
      {conquistas.length === 0 ? (
        <div style={{ padding: '24px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
          Nenhuma conquista ainda. Complete desafios e simulados!
        </div>
      ) : (
        <div>
          {conquistas.map((c, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 20px',
              borderBottom: i < conquistas.length - 1 ? '0.5px solid rgba(0,0,0,0.06)' : 'none',
            }}>
              {/* Ícone */}
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: c.tipo === 'ranking' ? '#fff7ed' : '#f0fdf4',
              }}>
                {c.tipo === 'ranking'
                  ? <Trophy size={16} color="#f97316" strokeWidth={2.5} />
                  : <Swords size={16} color="#16a34a" strokeWidth={2.5} />
                }
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.titulo}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{c.detalhe}</div>
              </div>

              {/* Penas */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <Feather size={12} color="#f97316" />
                <span style={{ fontSize: 14, fontWeight: 700, color: '#f97316' }}>+{c.penas}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
