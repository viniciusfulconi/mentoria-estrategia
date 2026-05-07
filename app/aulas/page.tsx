'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Nav from '@/components/Nav'
import Link from 'next/link'

export default function Aulas() {
  const [aulas, setAulas] = useState<any[]>([])
  const [filtro, setFiltro] = useState('todas')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('aulas').select('*, turma:turmas(nome,tipo)').order('created_at', {ascending:false})
      .then(({ data }) => { setAulas(data||[]); setLoading(false) })
  }, [])

  const filtros = ['todas','ITA','Medicina','Física','Matemática','Biologia','Química','Português']
  const aulasFiltradas = filtro==='todas' ? aulas : aulas.filter(a=>a.turma?.tipo===filtro||a.materia===filtro)

  function ytThumb(id:string) { return `https://img.youtube.com/vi/${id}/mqdefault.jpg` }

  return (
    <div style={{ paddingBottom:80 }}>
      <div style={{ background:'white', borderBottom:'0.5px solid rgba(0,0,0,0.08)', padding:'16px', position:'sticky', top:0, zIndex:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ fontSize:17, fontWeight:600 }}>Aulas</div>
        <Link href="/aulas/nova" style={{ textDecoration:'none', background:'#534AB7', color:'white', borderRadius:10, padding:'7px 14px', fontSize:13, fontWeight:500 }}>+ Nova</Link>
      </div>

      <div style={{ display:'flex', gap:6, overflowX:'auto', padding:'10px 16px', background:'white', borderBottom:'0.5px solid rgba(0,0,0,0.06)' }}>
        {filtros.map(f => (
          <button key={f} onClick={()=>setFiltro(f)} style={{
            padding:'5px 12px', borderRadius:20, fontSize:12, border:'0.5px solid rgba(0,0,0,0.12)',
            background:filtro===f?'#534AB7':'transparent', color:filtro===f?'white':'#666',
            cursor:'pointer', whiteSpace:'nowrap', fontFamily:'DM Sans,sans-serif'
          }}>{f==='todas'?'Todas':f}</button>
        ))}
      </div>

      <div style={{ padding:16 }}>
        {loading ? <div style={{ textAlign:'center', color:'#999', padding:40 }}>Carregando...</div>
        : aulasFiltradas.length === 0 ? (
          <div className="card" style={{ textAlign:'center', color:'#999', padding:40 }}>
            <div style={{ fontSize:32, marginBottom:10 }}>▶</div>
            <div>Nenhuma aula encontrada.</div>
            <Link href="/aulas/nova" style={{ textDecoration:'none', display:'inline-block', marginTop:14, background:'#534AB7', color:'white', borderRadius:12, padding:'10px 20px', fontSize:14 }}>Adicionar aula</Link>
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {aulasFiltradas.map((a:any) => (
              <a key={a.id} href={a.youtube_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration:'none' }}>
                <div className="card" style={{ padding:0, overflow:'hidden' }}>
                  <div style={{ position:'relative', background:'#0f0f1a', height:88 }}>
                    <img src={ytThumb(a.youtube_id)} alt={a.titulo} style={{ width:'100%', height:'100%', objectFit:'cover', opacity:0.85 }} onError={e=>{(e.target as HTMLImageElement).style.display='none'}} />
                    <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <div style={{ width:30, height:30, borderRadius:'50%', background:'rgba(255,255,255,0.9)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <span style={{ fontSize:12, color:'#534AB7', marginLeft:2 }}>▶</span>
                      </div>
                    </div>
                    <span style={{ position:'absolute', top:6, left:6 }} className={a.turma?.tipo==='ITA'?'badge-ita':'badge-med'}>{a.turma?.tipo||'Geral'}</span>
                  </div>
                  <div style={{ padding:'8px 10px 10px' }}>
                    <div style={{ fontSize:11, fontWeight:500, color:'#1a1a1a', lineHeight:1.4, marginBottom:4 }}>{a.titulo}</div>
                    <div style={{ fontSize:10, color:'#999' }}>{a.materia} · {a.duracao}</div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
      <Nav />
    </div>
  )
}
