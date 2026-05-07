'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Nav from '@/components/Nav'
import { useRouter, useParams } from 'next/navigation'

const MATERIAS = ['Matemática', 'Física', 'Química', 'Português/Redação']
const CORES = { Matemática: '#534AB7', Física: '#1D9E75', Química: '#EF9F27', 'Português/Redação': '#D85A30' }

function PizzaChart({ gabarito, parcial, zero, materia }: { gabarito: number, parcial: number, zero: number, materia: string }) {
  const total = gabarito + parcial + zero
  if (!total) return null
  const cor = (CORES as any)[materia] || '#534AB7'
  const pGab = (gabarito / total) * 100
  const pPar = (parcial / total) * 100
  const pZer = (zero / total) * 100
  // SVG donut
  const r = 40, cx = 50, cy = 50, stroke = 18
  const circ = 2 * Math.PI * r
  const gab = (pGab / 100) * circ
  const par = (pPar / 100) * circ
  const zer = (pZer / 100) * circ

  return (
    <div style={{ textAlign: 'center' }}>
      <svg viewBox="0 0 100 100" width="100" height="100">
        {/* Zero (cinza) */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#E8E8E8" strokeWidth={stroke} />
        {/* Parcial (laranja) */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#EF9F27" strokeWidth={stroke}
          strokeDasharray={`${par} ${circ - par}`}
          strokeDashoffset={-(gab)}
          transform="rotate(-90 50 50)" />
        {/* Gabarito (cor da matéria) */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={cor} strokeWidth={stroke}
          strokeDasharray={`${gab} ${circ - gab}`}
          strokeDashoffset="0"
          transform="rotate(-90 50 50)" />
        <text x="50" y="47" textAnchor="middle" fontSize="11" fontWeight="600" fill="#1a1a1a">{Math.round(pGab)}%</text>
        <text x="50" y="59" textAnchor="middle" fontSize="8" fill="#999">gabarito</text>
      </svg>
      <div style={{ fontSize: 11, color: '#1a1a1a', fontWeight: 500, marginTop: 4 }}>{materia}</div>
      <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>
        <span style={{ color: cor }}>■ {gabarito}g</span>{'  '}
        <span style={{ color: '#EF9F27' }}>■ {parcial}p</span>{'  '}
        <span style={{ color: '#ccc' }}>■ {zero}z</span>
      </div>
    </div>
  )
}

function NotaBar({ nota, max = 10, label }: { nota: number, max?: number, label: string }) {
  const pct = Math.min((nota / max) * 100, 100)
  const cor = nota >= 7 ? '#1D9E75' : nota >= 5 ? '#EF9F27' : '#E24B4A'
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: '#666' }}>{label}</span>
        <span style={{ fontWeight: 600, color: cor }}>{nota.toFixed(1)}</span>
      </div>
      <div style={{ height: 6, background: '#F0EEE8', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: cor, borderRadius: 3, transition: 'width 0.5s' }} />
      </div>
    </div>
  )
}

export default function AlunoPage() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string
  const [dados, setDados] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [cicloAtivo, setCicloAtivo] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    supabase.from('resultados').select('*').eq('id_aluno', id).order('ciclo_nome')
      .then(({ data }) => {
        setDados(data || [])
        const rankings = (data || []).filter(r => r.fase === 'ranking')
        if (rankings.length) setCicloAtivo(rankings[0].ciclo_nome)
        setLoading(false)
      })
  }, [id])

  const nomeAluno = dados[0]?.nome_aluno || '...'
  const mentor = dados[0]?.mentor || ''

  // Agrupa rankings por ciclo
  const rankings = dados.filter(r => r.fase === 'ranking')
  const ciclos = [...new Set(rankings.map(r => r.ciclo_nome))].sort()

  // Dados do ciclo ativo
  const rankingAtivo = rankings.find(r => r.ciclo_nome === cicloAtivo)

  // Dados 2ª fase do ciclo ativo para pizza
  const fase2do = (fase: string) => dados.find(r => r.ciclo_nome?.includes(cicloAtivo?.split(' - ')[0] || '') && r.fase === fase)

  function pizzaData(registro: any) {
    if (!registro?.notas_questoes) return { gabarito: 0, parcial: 0, zero: 0 }
    const vals = Object.values(registro.notas_questoes) as number[]
    return {
      gabarito: vals.filter(v => v >= 0.9).length,
      parcial: vals.filter(v => v > 0 && v < 0.9).length,
      zero: vals.filter(v => v === 0).length,
    }
  }

  // Médias gerais
  function mediaGeralMateria(campo: string) {
    const vals = rankings.map(r => r[campo]).filter(v => v !== null && v !== undefined) as number[]
    if (!vals.length) return null
    return vals.reduce((a, b) => a + Number(b), 0) / vals.length
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>Carregando...</div>
  if (!dados.length) return <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>Aluno não encontrado.</div>

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>←</button>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{nomeAluno}</div>
          <div style={{ fontSize: 11, color: '#999' }}>{mentor}</div>
        </div>
      </div>

      {/* Seletor de ciclo */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '10px 16px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
        {ciclos.map(c => (
          <button key={c} onClick={() => setCicloAtivo(c)} style={{
            padding: '5px 12px', borderRadius: 20, fontSize: 11, border: '0.5px solid rgba(0,0,0,0.12)',
            background: cicloAtivo === c ? '#534AB7' : 'transparent',
            color: cicloAtivo === c ? 'white' : '#666',
            cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'DM Sans,sans-serif'
          }}>
            {c.replace('Ciclo ', 'C').replace(' - ITA', '').replace(' - IME', '')}
          </button>
        ))}
      </div>

      <div style={{ padding: 16 }}>
        {/* Resultado do ciclo */}
        {rankingAtivo && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{cicloAtivo}</div>
              <span style={{
                fontSize: 11, padding: '3px 10px', borderRadius: 10, fontWeight: 500,
                background: rankingAtivo.resultado_ciclo === 'Aprovado' ? '#EAF3DE' : '#FCEBEB',
                color: rankingAtivo.resultado_ciclo === 'Aprovado' ? '#27500A' : '#791F1F'
              }}>
                {rankingAtivo.resultado_ciclo === 'Aprovado' ? '✓ Aprovado' : '✗ Reprovado'}
              </span>
            </div>

            {/* Barras de nota */}
            <div className="card" style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, color: '#1a1a1a' }}>Notas do ciclo</div>
              {rankingAtivo.media_1fase !== null && <NotaBar nota={Number(rankingAtivo.media_1fase)} label="1ª Fase" />}
              {rankingAtivo.nota_matematica !== null && <NotaBar nota={Number(rankingAtivo.nota_matematica)} label="Matemática (2ª fase)" />}
              {rankingAtivo.nota_fisica !== null && <NotaBar nota={Number(rankingAtivo.nota_fisica)} label="Física (2ª fase)" />}
              {rankingAtivo.nota_quimica !== null && <NotaBar nota={Number(rankingAtivo.nota_quimica)} label="Química (2ª fase)" />}
              {rankingAtivo.media_linguagens !== null && <NotaBar nota={Number(rankingAtivo.media_linguagens)} label="Port./Redação (2ª fase)" />}
              {rankingAtivo.media_2fase !== null && (
                <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.06)', marginTop: 10, paddingTop: 10 }}>
                  <NotaBar nota={Number(rankingAtivo.media_2fase)} label="Média 2ª Fase" />
                </div>
              )}
            </div>

            {/* Pizzas 2ª fase */}
            <div className="card" style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 14, color: '#1a1a1a' }}>Assertividade 2ª fase</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {[
                  { fase: '2fase_mat', mat: 'Matemática' },
                  { fase: '2fase_fis', mat: 'Física' },
                  { fase: '2fase_qui', mat: 'Química' },
                  { fase: '2fase_port', mat: 'Português/Redação' },
                ].map(({ fase, mat }) => {
                  const reg = dados.find(r => r.ciclo_nome === cicloAtivo && r.fase === fase)
                  if (!reg?.notas_questoes) return null
                  const p = pizzaData(reg)
                  return <PizzaChart key={fase} gabarito={p.gabarito} parcial={p.parcial} zero={p.zero} materia={mat} />
                })}
              </div>
              <div style={{ marginTop: 12, fontSize: 10, color: '#999', textAlign: 'center' }}>
                <span style={{ color: '#534AB7' }}>■ gabarito (≥0.9)</span>{'  '}
                <span style={{ color: '#EF9F27' }}>■ parcial</span>{'  '}
                <span style={{ color: '#ccc' }}>■ zero</span>
              </div>
            </div>
          </>
        )}

        {/* Evolução geral */}
        {ciclos.length > 1 && (
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, color: '#1a1a1a' }}>Evolução por ciclo</div>
            {rankings.sort((a, b) => a.ciclo_nome.localeCompare(b.ciclo_nome)).map(r => {
              const media = r.media_2fase !== null
                ? ((Number(r.media_1fase || 0) + Number(r.media_2fase || 0)) / 2)
                : Number(r.media_1fase || 0)
              const cor = r.resultado_ciclo === 'Aprovado' ? '#1D9E75' : '#E24B4A'
              return (
                <div key={r.ciclo_nome} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: '#666' }}>{r.ciclo_nome.replace('Ciclo ', 'C').replace(' - ITA', '').replace(' - IME', '')}</span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: r.resultado_ciclo === 'Aprovado' ? '#EAF3DE' : '#FCEBEB', color: r.resultado_ciclo === 'Aprovado' ? '#27500A' : '#791F1F' }}>
                        {r.resultado_ciclo === 'Aprovado' ? '✓' : '✗'}
                      </span>
                      <span style={{ fontWeight: 600, color: cor }}>{media.toFixed(1)}</span>
                    </div>
                  </div>
                  <div style={{ height: 5, background: '#F0EEE8', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(media / 10) * 100}%`, background: cor, borderRadius: 3 }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Médias gerais por matéria */}
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, color: '#1a1a1a' }}>Médias gerais (todos os ciclos)</div>
          {[
            { label: 'Matemática', campo: 'nota_matematica' },
            { label: 'Física', campo: 'nota_fisica' },
            { label: 'Química', campo: 'nota_quimica' },
            { label: 'Port./Redação', campo: 'media_linguagens' },
            { label: '1ª Fase', campo: 'media_1fase' },
          ].map(({ label, campo }) => {
            const m = mediaGeralMateria(campo)
            if (m === null) return null
            return <NotaBar key={campo} nota={m} label={label} />
          })}
        </div>
      </div>
      <Nav />
    </div>
  )
}
