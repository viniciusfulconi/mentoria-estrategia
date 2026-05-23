'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Nav from '@/components/Nav'
import Link from 'next/link'

export default function Turmas() {
  const [turmas, setTurmas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('turmas').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setTurmas(data || []); setLoading(false) })
  }, [])

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background:'white', borderBottom:'0.5px solid rgba(0,0,0,0.08)', padding:'16px', position:'sticky', top:0, zIndex:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ fontSize:17, fontWeight:600 }}>Turmas</div>
        <Link href="/turmas/nova" style={{ textDecoration:'none', background:'#2563EB', color:'white', borderRadius:10, padding:'7px 14px', fontSize:13, fontWeight:500 }}>+ Nova</Link>
      </div>
      <div style={{ padding:16 }}>
        {loading ? <div style={{ textAlign:'center', color:'#999', padding:40 }}>Carregando...</div>
        : turmas.length === 0 ? (
          <div className="card" style={{ textAlign:'center', color:'#999', padding:40 }}>
            <div style={{ fontSize:32, marginBottom:10 }}>◈</div>
            <div>Nenhuma turma ainda.</div>
            <Link href="/turmas/nova" style={{ textDecoration:'none', display:'inline-block', marginTop:14, background:'#2563EB', color:'white', borderRadius:12, padding:'10px 20px', fontSize:14 }}>Criar turma</Link>
          </div>
        ) : turmas.map((t:any) => (
          <div key={t.id} className="card" style={{ marginBottom:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <div>
                <div style={{ fontWeight:600, fontSize:14 }}>{t.nome}</div>
                <div style={{ fontSize:11, color:'#999', marginTop:2 }}>{t.ano}</div>
              </div>
              <span className={t.tipo==='ITA'?'badge-ita':'badge-med'}>{t.tipo}</span>
            </div>
            <div style={{ borderTop:'0.5px solid rgba(0,0,0,0.06)', paddingTop:10, display:'flex', flexDirection:'column', gap:6 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}>
                <span style={{ color:'#999' }}>Orçamento total</span>
                <span style={{ fontWeight:500 }}>R$ {Number(t.orcamento_total||0).toLocaleString('pt-BR')}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <Nav />
    </div>
  )
}
