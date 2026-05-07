'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Nav from '@/components/Nav'
import Link from 'next/link'

export default function Home() {
  const [stats, setStats] = useState({ alunos: 0, mentores: 0, atendimentos: 0, aulas: 0 })
  const [turmas, setTurmas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ count: alunos }, { count: mentores }, { count: atendimentos }, { count: aulas }, { data: turmasData }] = await Promise.all([
        supabase.from('alunos').select('*', { count: 'exact', head: true }),
        supabase.from('mentores').select('*', { count: 'exact', head: true }),
        supabase.from('atendimentos').select('*', { count: 'exact', head: true }),
        supabase.from('aulas').select('*', { count: 'exact', head: true }),
        supabase.from('turmas').select('*'),
      ])
      setStats({ alunos: alunos||0, mentores: mentores||0, atendimentos: atendimentos||0, aulas: aulas||0 })
      setTurmas(turmasData || [])
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background:'white', borderBottom:'0.5px solid rgba(0,0,0,0.08)', padding:'16px', position:'sticky', top:0, zIndex:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontSize:11, color:'#999', marginBottom:2 }}>Estratégia Concursos</div>
          <div style={{ fontSize:17, fontWeight:600, color:'#534AB7' }}>Mentoria</div>
        </div>
        <div style={{ width:36, height:36, borderRadius:'50%', background:'#EEEDFE', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:600, color:'#3C3489' }}>CO</div>
      </div>

      <div style={{ padding:16 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:20 }}>
          {[
            { label:'Alunos ativos', value:stats.alunos, sub:'ITA + Medicina' },
            { label:'Mentores', value:stats.mentores, sub:'no programa' },
            { label:'Atendimentos', value:stats.atendimentos, sub:'total registrado' },
            { label:'Videoaulas', value:stats.aulas, sub:'cadastradas' },
          ].map(s => (
            <div key={s.label} style={{ background:'white', border:'0.5px solid rgba(0,0,0,0.08)', borderRadius:16, padding:'14px 16px' }}>
              <div style={{ fontSize:11, color:'#999', marginBottom:4 }}>{s.label}</div>
              <div style={{ fontSize:26, fontWeight:600, color:'#1a1a1a', lineHeight:1 }}>{loading ? '—' : s.value}</div>
              <div style={{ fontSize:11, color:'#bbb', marginTop:3 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom:8, fontSize:11, fontWeight:600, color:'#999', letterSpacing:'0.05em', textTransform:'uppercase' }}>Turmas ativas</div>
        {loading ? (
          <div className="card" style={{ textAlign:'center', color:'#999', padding:30 }}>Carregando...</div>
        ) : turmas.length === 0 ? (
          <div className="card" style={{ textAlign:'center', color:'#999', padding:30 }}>
            <div style={{ fontSize:24, marginBottom:8 }}>◈</div>
            <div style={{ marginBottom:12 }}>Nenhuma turma cadastrada ainda.</div>
            <Link href="/turmas/nova" style={{ textDecoration:'none', display:'inline-block', background:'#534AB7', color:'white', borderRadius:12, padding:'10px 20px', fontSize:14, fontWeight:500 }}>Criar primeira turma</Link>
          </div>
        ) : turmas.map((t:any) => (
          <div key={t.id} className="card" style={{ marginBottom:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <div>
                <div style={{ fontWeight:600, fontSize:14 }}>{t.nome}</div>
                <div style={{ fontSize:11, color:'#999', marginTop:2 }}>{t.ano}</div>
              </div>
              <span className={t.tipo==='ITA' ? 'badge-ita' : 'badge-med'}>{t.tipo}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#999' }}>
              <span>Orçamento</span>
              <span style={{ fontWeight:500, color:'#1a1a1a' }}>R$ {Number(t.orcamento_total||0).toLocaleString('pt-BR')}</span>
            </div>
          </div>
        ))}

        <div style={{ marginTop:20, marginBottom:8, fontSize:11, fontWeight:600, color:'#999', letterSpacing:'0.05em', textTransform:'uppercase' }}>Acesso rápido</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          {[
            { href:'/mentores/novo', label:'Novo mentor', icon:'◉' },
            { href:'/alunos/novo', label:'Novo aluno', icon:'◎' },
            { href:'/aulas/nova', label:'Nova aula', icon:'▶' },
            { href:'/turmas/nova', label:'Nova turma', icon:'◈' },
          ].map(l => (
            <Link key={l.href} href={l.href} style={{ textDecoration:'none' }}>
              <div className="card" style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}>
                <span style={{ fontSize:20, color:'#534AB7' }}>{l.icon}</span>
                <span style={{ fontSize:13, fontWeight:500 }}>{l.label}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
      <Nav />
    </div>
  )
}
