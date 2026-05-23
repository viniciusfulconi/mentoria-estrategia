'use client'
import { useEffect, useState } from 'react'
import { dbQuery } from '@/lib/supabase'
import Nav from '@/components/Nav'
import Link from 'next/link'

export default function Mentores() {
  const [mentores, setMentores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    dbQuery('mentores', { order: 'nome' }, '*, turma:turmas(nome,tipo)')
      .then(({ data }) => { setMentores(data || []); setLoading(false) })
  }, [])

  const stars = (n: number) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n))

  return (
    <div style={{ paddingBottom:80 }}>
      <div style={{ background:'white', borderBottom:'0.5px solid rgba(0,0,0,0.08)', padding:'16px', position:'sticky', top:0, zIndex:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ fontSize:17, fontWeight:600 }}>Mentores</div>
        <Link href="/mentores/novo" style={{ textDecoration:'none', background:'#2563EB', color:'white', borderRadius:10, padding:'7px 14px', fontSize:13, fontWeight:500 }}>+ Novo</Link>
      </div>
      <div style={{ padding:16 }}>
        {loading ? <div style={{ textAlign:'center', color:'#999', padding:40 }}>Carregando...</div>
        : mentores.length === 0 ? (
          <div className="card" style={{ textAlign:'center', color:'#999', padding:40 }}>
            <div style={{ fontSize:32, marginBottom:10 }}>◉</div>
            <div>Nenhum mentor cadastrado.</div>
            <Link href="/mentores/novo" style={{ textDecoration:'none', display:'inline-block', marginTop:14, background:'#2563EB', color:'white', borderRadius:12, padding:'10px 20px', fontSize:14 }}>Adicionar mentor</Link>
          </div>
        ) : mentores.map((m:any) => (
          <div key={m.id} className="card" style={{ marginBottom:10 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
              <div style={{ width:40, height:40, borderRadius:'50%', background:'#EFF6FF', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:600, color:'#1E40AF', flexShrink:0 }}>
                {m.nome.split(' ').map((w:string)=>w[0]).slice(0,2).join('')}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:14 }}>{m.nome}</div>
                <div style={{ fontSize:11, color:'#999' }}>{m.materia} · {m.turma?.nome}</div>
              </div>
              <span className={m.turma?.tipo==='ITA'?'badge-ita':'badge-med'}>{m.turma?.tipo}</span>
            </div>
            <div style={{ borderTop:'0.5px solid rgba(0,0,0,0.06)', paddingTop:10, display:'flex', flexDirection:'column', gap:6 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}>
                <span style={{ color:'#999' }}>Atendimentos</span>
                <span style={{ fontWeight:500 }}>{m.total_atendimentos || 0}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}>
                <span style={{ color:'#999' }}>Valor por atendimento</span>
                <span style={{ fontWeight:500 }}>R$ {Number(m.valor_por_atendimento||0).toFixed(0)}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}>
                <span style={{ color:'#999' }}>Nota média</span>
                <span style={{ color:'#D97706', fontWeight:500 }}>{stars(m.nota_media||0)} {Number(m.nota_media||0).toFixed(1)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <Nav />
    </div>
  )
}
