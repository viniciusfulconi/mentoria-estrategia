'use client'
import { useEffect, useState } from 'react'
import { dbQuery } from '@/lib/supabase'
import Nav from '@/components/Nav'
import Link from 'next/link'

export default function Home() {
  const [stats, setStats] = useState({ alunos: 0, mentores: 0, atendimentos: 0, aulas: 0 })
  const [turmas, setTurmas] = useState<any[]>([])
  const [emRisco, setEmRisco] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: alunosD }, { data: mentoresD }, { data: atendimentosD }, { data: aulasD }, { data: turmasData }, { data: rankings }] = await Promise.all([
        dbQuery('alunos', {}, 'id'),
        dbQuery('mentores', {}, 'id'),
        dbQuery('atendimentos', {}, 'id'),
        dbQuery('aulas', {}, 'id'),
        dbQuery('turmas'),
        dbQuery('resultados',
          { fase: 'eq.ranking', resultado_ciclo: 'not.is.null', order: 'ciclo_nome.desc' },
          'id_aluno,nome_aluno,mentor,ciclo_nome,concurso,resultado_ciclo,nota_matematica,nota_fisica,nota_quimica,media_linguagens,media_2fase,media_1fase'
        ),
      ])
      setStats({ alunos: alunosD?.length||0, mentores: mentoresD?.length||0, atendimentos: atendimentosD?.length||0, aulas: aulasD?.length||0 })
      setTurmas(turmasData || [])

      // Pega o ciclo mais recente de cada aluno e identifica os em risco
      const latestMap: Record<string, any> = {}
      ;(rankings || []).forEach(r => {
        if (!latestMap[r.id_aluno]) latestMap[r.id_aluno] = r
      })
      const risco = Object.values(latestMap).filter(r => {
        if (r.resultado_ciclo === 'Reprovado') return true
        // Borderline: qualquer nota entre 4.0 e 4.5 (ou média 2ª entre 5.0 e 5.5)
        const notas = [r.nota_matematica, r.nota_fisica, r.nota_quimica, r.media_linguagens]
          .map(Number).filter(v => v > 0)
        return notas.some(v => v < 4.5) || (r.media_2fase && Number(r.media_2fase) < 5.5 && Number(r.media_2fase) >= 5.0)
      }).sort((a, b) => {
        // Reprovados primeiro, depois por nome
        if (a.resultado_ciclo === 'Reprovado' && b.resultado_ciclo !== 'Reprovado') return -1
        if (b.resultado_ciclo === 'Reprovado' && a.resultado_ciclo !== 'Reprovado') return 1
        return (a.nome_aluno || '').localeCompare(b.nome_aluno || '')
      })
      setEmRisco(risco)
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background:'white', borderBottom:'0.5px solid rgba(0,0,0,0.08)', padding:'16px', position:'sticky', top:0, zIndex:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontSize:11, color:'#999', marginBottom:2 }}>Estratégia Concursos</div>
          <div style={{ fontSize:17, fontWeight:600, color:'#2563EB' }}>Mentoria</div>
        </div>
        <div style={{ width:36, height:36, borderRadius:'50%', background:'#EFF6FF', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:600, color:'#1E40AF' }}>CO</div>
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
            <Link href="/turmas/nova" style={{ textDecoration:'none', display:'inline-block', background:'#2563EB', color:'white', borderRadius:12, padding:'10px 20px', fontSize:14, fontWeight:500 }}>Criar primeira turma</Link>
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

        {/* Alunos em risco */}
        {!loading && emRisco.length > 0 && (
          <>
            <div style={{ marginTop:20, marginBottom:8, fontSize:11, fontWeight:600, color:'#999', letterSpacing:'0.05em', textTransform:'uppercase' }}>
              Atenção — {emRisco.length} aluno{emRisco.length > 1 ? 's' : ''} em risco
            </div>
            <div className="card" style={{ padding:0, overflow:'hidden', marginBottom:4 }}>
              {emRisco.map((r, i) => {
                const isCortado = r.resultado_ciclo === 'Reprovado'
                const notas = [
                  { label: 'Mat', val: r.nota_matematica },
                  { label: 'Fís', val: r.nota_fisica },
                  { label: 'Quí', val: r.nota_quimica },
                  { label: 'Port', val: r.media_linguagens },
                ].filter(n => n.val != null && Number(n.val) > 0)
                const criticas = notas.filter(n => Number(n.val) < 4.5)
                return (
                  <Link key={r.id_aluno} href={`/aluno/${r.id_aluno}`} style={{ textDecoration:'none' }}>
                    <div style={{
                      display:'flex', alignItems:'center', gap:12, padding:'11px 14px',
                      borderBottom: i < emRisco.length - 1 ? '1px solid var(--border)' : 'none',
                      background: isCortado ? '#FFF8F8' : '#FFFCF3',
                    }}>
                      <span style={{ fontSize:14, flexShrink:0 }}>{isCortado ? '🔴' : '🟡'}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:500, color:'#1a1a1a',
                          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {r.nome_aluno}
                        </div>
                        <div style={{ fontSize:10, color:'#999', marginTop:1 }}>
                          {r.mentor} · {String(r.ciclo_nome).replace('Ciclo ', 'C')}
                        </div>
                      </div>
                      <div style={{ textAlign:'right', flexShrink:0 }}>
                        {criticas.length > 0 ? (
                          <div style={{ fontSize:11, color: isCortado ? '#DC2626' : '#D97706', fontWeight:600 }}>
                            {criticas.map(n => `${n.label} ${Number(n.val).toFixed(1)}`).join(' · ')}
                          </div>
                        ) : (
                          <div style={{ fontSize:11, color:'#D97706', fontWeight:600 }}>
                            Média {Number(r.media_2fase).toFixed(1)}
                          </div>
                        )}
                        <div style={{ fontSize:10, color:'#bbb', marginTop:1 }}>
                          {isCortado ? 'Reprovado' : 'Próximo do limite'}
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </>
        )}

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
                <span style={{ fontSize:20, color:'#2563EB' }}>{l.icon}</span>
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
