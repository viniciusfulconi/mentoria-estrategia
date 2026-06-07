'use client'
import { useEffect, useState } from 'react'
import { dbQuery } from '@/lib/supabase'
import Nav from '@/components/Nav'
import Link from 'next/link'

export default function Alunos() {
  const [alunos, setAlunos] = useState<any[]>([])
  const [simulados, setSimulados] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      dbQuery('alunos', { order: 'nome' }, '*, turma:turmas(nome,tipo), mentor:mentores(nome)'),
      dbQuery('simulados'),
    ]).then(([{data:a},{data:s}]) => {
      setAlunos(a||[])
      setSimulados(s||[])
      setLoading(false)
    })
  }, [])

  function ultimaNota(alunoId: string) {
    const sims = simulados.filter(s=>s.aluno_id===alunoId).sort((a,b)=>new Date(b.data).getTime()-new Date(a.data).getTime())
    return sims[0]?.nota
  }

  function mediaNota(alunoId: string) {
    const sims = simulados.filter(s=>s.aluno_id===alunoId)
    if (!sims.length) return null
    return sims.reduce((acc,s)=>acc+s.nota,0)/sims.length
  }

  return (
    <div style={{ paddingBottom:80 }}>
      <div style={{ background:'white', borderBottom:'0.5px solid rgba(0,0,0,0.08)', padding:'16px', position:'sticky', top:0, zIndex:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ fontSize:17, fontWeight:600 }}>Alunos</div>
        <Link href="/alunos/novo" style={{ textDecoration:'none', background:'#f97316', color:'white', borderRadius:10, padding:'7px 14px', fontSize:13, fontWeight:500 }}>+ Novo</Link>
      </div>
      <div style={{ padding:16 }}>
        {loading ? (
          <>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card" style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="skeleton" style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0 }} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div className="skeleton" style={{ height: 13, width: '60%' }} />
                    <div className="skeleton" style={{ height: 11, width: '40%' }} />
                  </div>
                </div>
              </div>
            ))}
          </>
        )
        : alunos.length === 0 ? (
          <div className="card" style={{ textAlign:'center', color:'#999', padding:40 }}>
            <div style={{ fontSize:32, marginBottom:10 }}>◎</div>
            <div>Nenhum aluno cadastrado.</div>
            <Link href="/alunos/novo" style={{ textDecoration:'none', display:'inline-block', marginTop:14, background:'#f97316', color:'white', borderRadius:12, padding:'10px 20px', fontSize:14 }}>Adicionar aluno</Link>
          </div>
        ) : alunos.map((a:any) => {
          const ultima = ultimaNota(a.id)
          const media = mediaNota(a.id)
          const perf = media !== null ? Math.round((media/10)*100) : null
          return (
            <div key={a.id} className="card" style={{ marginBottom:10 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
                <div style={{ width:36, height:36, borderRadius:'50%', background:'#fff7ed', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, color:'#1E40AF', flexShrink:0 }}>
                  {a.nome.split(' ').map((w:string)=>w[0]).slice(0,2).join('')}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:600, fontSize:14 }}>{a.nome}</div>
                  <div style={{ fontSize:11, color:'#999' }}>{a.turma?.nome}{a.mentor ? ` · ${a.mentor.nome}` : ''}</div>
                </div>
                {perf !== null && <span className={perf>=70?'badge-ok':'badge-alert'}>{perf}%</span>}
              </div>
              {(ultima !== undefined || media !== null) && (
                <div style={{ borderTop:'0.5px solid rgba(0,0,0,0.06)', paddingTop:8, display:'flex', gap:16 }}>
                  {ultima !== undefined && <div style={{ fontSize:11 }}><span style={{ color:'#999' }}>Último simulado: </span><span style={{ fontWeight:600 }}>{Number(ultima).toFixed(1)}</span></div>}
                  {media !== null && <div style={{ fontSize:11 }}><span style={{ color:'#999' }}>Média: </span><span style={{ fontWeight:600 }}>{Number(media).toFixed(1)}</span></div>}
                </div>
              )}
              {perf !== null && (
                <div style={{ marginTop:8, height:4, background:'rgba(0,0,0,0.06)', borderRadius:2, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${perf}%`, background: perf>=70?'#16A34A':'#D97706', borderRadius:2, transition:'width 0.4s' }} />
                </div>
              )}
            </div>
          )
        })}
      </div>
      <Nav />
    </div>
  )
}
