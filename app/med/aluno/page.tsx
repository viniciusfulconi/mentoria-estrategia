'use client'
import { useEffect, useState, useMemo } from 'react'
import { dbQuery, dbUpdate } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Nav from '@/components/Nav'
import { ChevronDown, ChevronUp, X } from 'lucide-react'

// ─── Constants ───────────────────────────────────────────────────────────────

const VESTIBULARES = [
  'ENEM','UERJ','UNITAU','USCS','UNIFAE','UEA','UVA','URCA','UEMA','UEMASUL','UERR',
  'USP','Unicamp','Unesp','Famema','Famerp','Unifesp','UFRGS','UFSC','UFPR','UEL',
  'UEM','UEPG','Unioeste','Unicentro','UnB','UFGD','UECE','UNEB','UEFS','UESB','UPE',
  'UFU','Unimontes','Santa Casa','Einstein','PUC-Campinas','FMABC','PUC-PR','PUC-MG','PUC-RS',
]
const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]
const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  'Ativo':                            { label: 'Ativo',                   bg: '#DCFCE7', color: '#166534' },
  'Ativo - Não optou pela mentoria':  { label: 'Não optou pela mentoria', bg: '#DBEAFE', color: '#1e40af' },
  'Ativo - Sem contato':              { label: 'Sem contato',             bg: '#FEF9C3', color: '#854d0e' },
  'Ativo - Sem resposta':             { label: 'Sem resposta',            bg: '#EDE9FE', color: '#5b21b6' },
  'Inativo - Cancelou o curso':       { label: 'Cancelou o curso',        bg: '#FEE2E2', color: '#991b1b' },
}
const MATERIAS_MED = [
  'Matemática','Física','Química','Inglês','Sociologia',
  'Filosofia','Artes','Biologia','História','Geografia','Espanhol',
]
const CORES: Record<string, string> = {
  'Matemática':'#6366f1','Física':'#3b82f6','Química':'#10b981',
  'Inglês':'#f59e0b','Sociologia':'#8b5cf6','Filosofia':'#ec4899',
  'Artes':'#f97316','Biologia':'#22c55e','História':'#a78bfa',
  'Geografia':'#14b8a6','Espanhol':'#ef4444',
}
const PHASE = [
  { label: 'Fundamentos', icon: '🌱', color: '#ef4444', bg: '#fee2e2' },
  { label: 'Aceleração',  icon: '⚡', color: '#f59e0b', bg: '#fef9c3' },
  { label: 'Domínio',     icon: '🏆', color: '#22c55e', bg: '#dcfce7' },
]

// ─── Types ───────────────────────────────────────────────────────────────────

type AlunoInfo = {
  id: string; nome: string; email: string; telefone: string | null
  modalidade: string | null; status_aluno: string; turma_id: string | null
  mentor_id: string | null; uf: string | null; cidade_aluno: string | null
  vestibulares_interesse: string[] | null
  turmas?: { nome: string }; mentores?: { nome: string }
}
type SimuladoScore = {
  simulado_id: string; nome: string; data: string
  pct: number; pontos_objetiva: number; total_respostas: number
}
type MateriaScore = { materia: string; acertos: number; total: number; pct: number }

// ─── Math ────────────────────────────────────────────────────────────────────

function sigmoidNorm(x: number): number {
  const sig = (t: number) => 1 / (1 + Math.exp(-8 * (t - 0.5)))
  const s0 = sig(0), s1 = sig(1)
  return 0.06 + ((sig(x) - s0) / (s1 - s0)) * 0.88
}

function catmullRom(pts: { px: number; py: number }[]): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M ${pts[0].px} ${pts[0].py}`
  let d = `M ${pts[0].px.toFixed(1)} ${pts[0].py.toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i]
    const p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)]
    const c1x = p1.px + (p2.px - p0.px) / 6, c1y = p1.py + (p2.py - p0.py) / 6
    const c2x = p2.px - (p3.px - p1.px) / 6, c2y = p2.py - (p3.py - p1.py) / 6
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.px.toFixed(1)} ${p2.py.toFixed(1)}`
  }
  return d
}

// ─── S-Curve chart ───────────────────────────────────────────────────────────

function SCurveChart({ simulados }: { simulados: SimuladoScore[] }) {
  const W = 360, H = 210
  const P = { t: 20, r: 16, b: 40, l: 40 }
  const cW = W - P.l - P.r, cH = H - P.t - P.b
  const n = simulados.length
  const lastPct = n > 0 ? simulados[n - 1].pct : 0
  const phase = lastPct < 40 ? 0 : lastPct < 65 ? 1 : 2
  const cur = PHASE[phase]

  // Reference sigmoid path
  const refPts = Array.from({ length: 101 }, (_, i) => {
    const x = i / 100
    return { px: P.l + x * cW, py: P.t + (1 - sigmoidNorm(x)) * cH }
  })
  const refPath = refPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.px.toFixed(1)} ${p.py.toFixed(1)}`).join(' ')
  const refFill = refPath
    + ` L ${(P.l + cW).toFixed(1)} ${(P.t + cH).toFixed(1)}`
    + ` L ${P.l.toFixed(1)} ${(P.t + cH).toFixed(1)} Z`

  // Student points
  const sPts = simulados.map((s, i) => ({
    px: P.l + (n > 1 ? i / (n - 1) : 0.5) * cW,
    py: P.t + (1 - s.pct / 100) * cH,
    pct: s.pct,
  }))
  const sPath = catmullRom(sPts)
  const last = sPts[sPts.length - 1]
  const sFill = sPath && last
    ? sPath
      + ` L ${last.px.toFixed(1)} ${(P.t + cH).toFixed(1)}`
      + ` L ${sPts[0].px.toFixed(1)} ${(P.t + cH).toFixed(1)} Z`
    : ''

  // Empty state: show faded reference sigmoid + message
  if (n === 0) {
    return (
      <div style={{ maxWidth: 420, margin: '0 auto' }}>
        <div style={{ position: 'relative' }}>
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ opacity: 0.2, display: 'block' }}>
            <path d={refFill} fill="#8b5cf6" fillOpacity="0.15" />
            <path d={refPath} fill="none" stroke="#8b5cf6" strokeWidth="2" />
          </svg>
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ textAlign: 'center', background: 'white', borderRadius: 12, padding: '12px 20px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>📈</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Realize seu primeiro simulado</div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>sua curva aparece aqui</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 420, margin: '0 auto' }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible', display: 'block' }}>
        <defs>
          <linearGradient id="scRef" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.01" />
          </linearGradient>
          <linearGradient id="scLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="45%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
          <linearGradient id="scFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={cur.color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={cur.color} stopOpacity="0" />
          </linearGradient>
          <filter id="scGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Phase background bands */}
        <rect x={P.l} y={P.t}              width={cW} height={cH * 0.35} fill="#dcfce7" fillOpacity="0.22" />
        <rect x={P.l} y={P.t + cH * 0.35} width={cW} height={cH * 0.25} fill="#fef9c3" fillOpacity="0.30" />
        <rect x={P.l} y={P.t + cH * 0.60} width={cW} height={cH * 0.40} fill="#fee2e2" fillOpacity="0.22" />

        {/* Grid lines at 40% and 65% */}
        {[{ pct: 65, color: '#4ade80', label: '65%' }, { pct: 40, color: '#fbbf24', label: '40%' }].map(g => {
          const gy = P.t + (1 - g.pct / 100) * cH
          return (
            <g key={g.pct}>
              <line x1={P.l} y1={gy} x2={P.l + cW} y2={gy} stroke={g.color} strokeWidth="1" strokeDasharray="3 3" strokeOpacity="0.7" />
              <text x={P.l - 4} y={gy + 4} fontSize="8" textAnchor="end" fill={g.color} fontWeight="600">{g.label}</text>
            </g>
          )
        })}

        {/* Reference sigmoid */}
        <path d={refFill} fill="url(#scRef)" />
        <path d={refPath} fill="none" stroke="#c4b5fd" strokeWidth="1.5" strokeDasharray="6 4" strokeOpacity="0.6" />

        {/* Student fill + line */}
        {sFill && <path d={sFill} fill="url(#scFill)" />}
        {sPath && <path d={sPath} fill="none" stroke="url(#scLine)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}

        {/* Data points */}
        {sPts.map((p, i) => {
          const isLast = i === sPts.length - 1
          return (
            <g key={i}>
              {isLast && (
                <circle cx={p.px} cy={p.py} r="10" fill={cur.color} fillOpacity="0.15">
                  <animate attributeName="r" values="8;13;8" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="fill-opacity" values="0.18;0.04;0.18" dur="2s" repeatCount="indefinite" />
                </circle>
              )}
              <circle cx={p.px} cy={p.py} r={isLast ? 5.5 : 4}
                fill="white"
                stroke={isLast ? cur.color : '#8b5cf6'}
                strokeWidth={isLast ? 2.5 : 1.8}
                filter={isLast ? 'url(#scGlow)' : undefined}
              />
              {n <= 8 && (
                <text x={p.px} y={p.py - 11} fontSize="8.5" textAnchor="middle"
                  fill={isLast ? cur.color : '#6b7280'}
                  fontWeight={isLast ? '700' : '500'}>
                  {p.pct}%
                </text>
              )}
            </g>
          )
        })}

        {/* X axis labels */}
        {n <= 8 && sPts.map((p, i) => (
          <text key={i} x={p.px} y={P.t + cH + 16} fontSize="8" textAnchor="middle" fill="#9ca3af">
            Sim.{i + 1}
          </text>
        ))}

        {/* Axes */}
        <line x1={P.l} y1={P.t} x2={P.l} y2={P.t + cH} stroke="#e5e7eb" strokeWidth="1" />
        <line x1={P.l} y1={P.t + cH} x2={P.l + cW} y2={P.t + cH} stroke="#e5e7eb" strokeWidth="1" />
        <text x={P.l - 4} y={P.t + 4} fontSize="8" textAnchor="end" fill="#9ca3af">100%</text>
        <text x={P.l - 4} y={P.t + cH + 4} fontSize="8" textAnchor="end" fill="#9ca3af">0%</text>
      </svg>

      {/* Legend + phase badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, padding: '0 2px' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          {PHASE.map((ph, i) => (
            <div key={ph.label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: ph.color, opacity: i === phase ? 1 : 0.35 }} />
              <span style={{ fontSize: 9.5, color: i === phase ? ph.color : '#9ca3af', fontWeight: i === phase ? 700 : 400 }}>
                {ph.label}
              </span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 9, color: '#bbb', display: 'flex', alignItems: 'center', gap: 3 }}>
          <svg width="18" height="6" style={{ flexShrink: 0 }}>
            <line x1="0" y1="3" x2="18" y2="3" stroke="#c4b5fd" strokeWidth="1.5" strokeDasharray="4 2" />
          </svg>
          esperado
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: 10 }}>
        <span style={{
          background: cur.bg, color: cur.color,
          fontSize: 12, fontWeight: 700, padding: '5px 16px', borderRadius: 20,
          display: 'inline-block',
        }}>
          {cur.icon} {cur.label} · {lastPct.toFixed(0)}%
        </span>
      </div>
    </div>
  )
}

// ─── Radar chart ─────────────────────────────────────────────────────────────

function RadarChart({ scores }: { scores: MateriaScore[] }) {
  if (scores.length === 0) return (
    <div style={{ textAlign: 'center', padding: '28px 16px', color: '#aaa', fontSize: 13 }}>
      Realize simulados para ver o radar.
    </div>
  )
  const n = scores.length
  const CX = 125, CY = 122, R = 85, W = 250, H = 244

  function pt(i: number, val: number): [number, number] {
    const ang = (2 * Math.PI * i / n) - Math.PI / 2
    return [CX + val * R * Math.cos(ang), CY + val * R * Math.sin(ang)]
  }

  const polyPts = scores.map((s, i) => pt(i, s.pct / 100))
  const polyStr = polyPts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

  return (
    <div style={{ maxWidth: 280, margin: '0 auto' }}>
    <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
      <defs>
        <linearGradient id="radarFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.1" />
        </linearGradient>
      </defs>

      {/* Level rings */}
      {[0.25, 0.5, 0.75, 1.0].map(lv => {
        const ringPts = scores.map((_, i) => pt(i, lv))
        const ringStr = ringPts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
        return (
          <g key={lv}>
            <polygon points={ringStr} fill="none" stroke="#e5e7eb" strokeWidth="1" />
            {lv < 1 && (
              <text x={CX + 3} y={CY - lv * R + 4} fontSize="7" fill="#d1d5db">{Math.round(lv * 100)}%</text>
            )}
          </g>
        )
      })}

      {/* Axis lines */}
      {scores.map((_, i) => {
        const [x, y] = pt(i, 1)
        return <line key={i} x1={CX} y1={CY} x2={x.toFixed(1)} y2={y.toFixed(1)} stroke="#e5e7eb" strokeWidth="1" />
      })}

      {/* Student polygon */}
      <polygon points={polyStr} fill="url(#radarFill)" stroke="#8b5cf6" strokeWidth="2" />

      {/* Dots + labels */}
      {scores.map((s, i) => {
        const [dx, dy] = pt(i, s.pct / 100)
        const [lx, ly] = pt(i, 1.28)
        const cor = CORES[s.materia] || '#8b5cf6'
        const short = s.materia.length > 7 ? s.materia.slice(0, 6) + '.' : s.materia
        return (
          <g key={i}>
            <circle cx={dx.toFixed(1)} cy={dy.toFixed(1)} r="4.5" fill={cor} stroke="white" strokeWidth="1.5" />
            <text x={lx.toFixed(1)} y={(ly - 5).toFixed(1)} textAnchor="middle" fontSize="9" fontWeight="600" fill={cor} dominantBaseline="middle">
              {short}
            </text>
            <text x={lx.toFixed(1)} y={(ly + 7).toFixed(1)} textAnchor="middle" fontSize="8" fill={cor} fillOpacity="0.7" dominantBaseline="middle">
              {s.pct}%
            </text>
          </g>
        )
      })}
    </svg>
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function MedAlunoHome() {
  const router = useRouter()
  const { perfil } = useAuth()

  const [aluno, setAluno] = useState<AlunoInfo | null>(null)
  const [alunoId, setAlunoId] = useState<string | null>(null)
  const [simulados, setSimulados] = useState<SimuladoScore[]>([])
  const [materias, setMaterias] = useState<MateriaScore[]>([])
  const [carregando, setCarregando] = useState(true)

  const [telefone, setTelefone] = useState('')
  const [uf, setUf] = useState('')
  const [cidade, setCidade] = useState('')
  const [vestibulares, setVestibulares] = useState<string[]>([])
  const [vestOpen, setVestOpen] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [sucesso, setSucesso] = useState('')
  const [aba, setAba] = useState<'dashboard' | 'dados'>('dashboard')

  useEffect(() => {
    if (!perfil) return
    if (perfil.papel !== 'aluno' || perfil.vertical !== 'Medicina') { router.replace('/'); return }
    carregar()
  }, [perfil])

  async function carregar() {
    if (!perfil) return
    setCarregando(true)

    let aData: AlunoInfo[] | null = null
    if (perfil.aluno_id) {
      const { data } = await dbQuery<AlunoInfo>('alunos', { id: `eq.${perfil.aluno_id}` }, '*,turmas(nome),mentores(nome)')
      aData = data
    }
    if (!aData?.length) {
      const { data } = await dbQuery<AlunoInfo>('alunos', { email: `eq.${perfil.email}`, vertical: 'eq.Medicina' }, '*,turmas(nome),mentores(nome)')
      aData = data
    }
    if (!aData?.length) { setCarregando(false); return }

    const a = aData[0]
    setAluno(a); setAlunoId(a.id)
    setTelefone(a.telefone || ''); setUf(a.uf || '')
    setCidade(a.cidade_aluno || ''); setVestibulares(a.vestibulares_interesse || [])

    const [{ data: scores }, { data: sims }] = await Promise.all([
      dbQuery('simulado_scores', { aluno_id: `eq.${a.id}` }, 'simulado_id,pontos_objetiva,total_respostas'),
      dbQuery('simulados_med', {}, 'id,nome,created_at'),
    ])

    const simMap: Record<string, any> = {}
    ;(sims || []).forEach((s: any) => { simMap[s.id] = s })

    const simsOrdered: SimuladoScore[] = (scores || [])
      .map((sc: any) => ({
        simulado_id: sc.simulado_id,
        nome: simMap[sc.simulado_id]?.nome || sc.simulado_id,
        data: simMap[sc.simulado_id]?.created_at || '',
        pct: sc.total_respostas > 0 ? Math.round((sc.pontos_objetiva / sc.total_respostas) * 100) : 0,
        pontos_objetiva: sc.pontos_objetiva,
        total_respostas: sc.total_respostas,
      }))
      .sort((x: SimuladoScore, y: SimuladoScore) => x.data.localeCompare(y.data))

    setSimulados(simsOrdered)

    if (simsOrdered.length > 0) {
      const simIds = simsOrdered.map(s => s.simulado_id).join(',')
      const [{ data: respostas }, { data: questoes }] = await Promise.all([
        dbQuery('simulado_respostas', { aluno_id: `eq.${a.id}`, simulado_id: `in.(${simIds})` }, 'questao_id,pontuacao'),
        dbQuery('simulado_questoes', { simulado_id: `in.(${simIds})` }, 'id,materia,tipo'),
      ])
      const qMap: Record<string, any> = {}
      ;(questoes || []).forEach((q: any) => { qMap[q.id] = q })
      const matMap: Record<string, { acertos: number; total: number }> = {}
      ;(respostas || []).forEach((r: any) => {
        const q = qMap[r.questao_id]
        if (!q || q.tipo !== 'objetiva') return
        if (!matMap[q.materia]) matMap[q.materia] = { acertos: 0, total: 0 }
        matMap[q.materia].total++
        if (r.pontuacao > 0) matMap[q.materia].acertos++
      })
      setMaterias(
        MATERIAS_MED.filter(m => matMap[m]).map(m => ({
          materia: m,
          acertos: matMap[m].acertos,
          total: matMap[m].total,
          pct: Math.round((matMap[m].acertos / matMap[m].total) * 100),
        }))
      )
    }

    setCarregando(false)
  }

  const mediaGeral = useMemo(() =>
    simulados.length ? Math.round(simulados.reduce((s, x) => s + x.pct, 0) / simulados.length) : 0
  , [simulados])

  const melhorNota = useMemo(() =>
    simulados.length ? Math.max(...simulados.map(s => s.pct)) : 0
  , [simulados])

  const tendencia = useMemo(() => {
    if (simulados.length < 2) return null
    return simulados[simulados.length - 1].pct - simulados[simulados.length - 2].pct
  }, [simulados])

  function formatTelefone(v: string) {
    const d = v.replace(/\D/g, '').slice(0, 11)
    if (d.length <= 2) return d
    if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  }

  function toggleVest(v: string) {
    setVestibulares(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v])
  }

  async function salvar() {
    if (!alunoId) return
    setSalvando(true)
    await dbUpdate('alunos', { id: `eq.${alunoId}` }, {
      telefone: telefone || null, uf: uf || null,
      cidade_aluno: cidade || null,
      vestibulares_interesse: vestibulares.length ? vestibulares : null,
    })
    setSalvando(false); setSucesso('Dados salvos!')
    setTimeout(() => setSucesso(''), 3000)
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    border: '1px solid rgba(0,0,0,0.12)', fontSize: 14,
    background: 'white', outline: 'none', boxSizing: 'border-box',
    fontFamily: 'DM Sans, sans-serif', color: '#1a1a1a',
  }

  if (carregando) return (
    <div style={{ paddingBottom: 80 }}><Nav />
      <div style={{ textAlign: 'center', padding: 60, color: '#aaa', fontSize: 13 }}>Carregando...</div>
    </div>
  )

  if (!aluno) return (
    <div style={{ paddingBottom: 80 }}><Nav />
      <div style={{ textAlign: 'center', padding: '60px 24px' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>👤</div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Cadastro não encontrado</div>
        <div style={{ fontSize: 13, color: '#aaa' }}>Entre em contato com o coordenador.</div>
      </div>
    </div>
  )

  const cfg = STATUS_CONFIG[aluno.status_aluno] || STATUS_CONFIG['Ativo']
  const phase = mediaGeral < 40 ? 0 : mediaGeral < 65 ? 1 : 2
  const cur = PHASE[phase]

  return (
    <div style={{ paddingBottom: 80, background: '#F7F6F3', minHeight: '100vh' }}>
      <Nav />

      {/* Header */}
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 700, color: 'white',
          }}>
            {aluno.nome.split(' ').map(w => w[0]).slice(0, 2).join('')}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#1a1a1a', marginBottom: 4 }}>{aluno.nome}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
              <span style={{ background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}>
                {cfg.label}
              </span>
              {aluno.turmas?.nome && <span style={{ fontSize: 11, color: '#999' }}>{aluno.turmas.nome}</span>}
              {aluno.modalidade && <span style={{ fontSize: 11, color: '#999' }}>{aluno.modalidade}</span>}
            </div>
            {aluno.mentores?.nome && (
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>
                Mentor: <span style={{ color: '#555', fontWeight: 500 }}>{aluno.mentores.nome}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', display: 'flex', padding: '0 16px' }}>
        {([['dashboard', 'Dashboard'], ['dados', 'Meus dados']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setAba(v)} style={{
            padding: '12px 18px', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: aba === v ? 700 : 400,
            color: aba === v ? 'var(--purple)' : '#888',
            borderBottom: aba === v ? '2px solid var(--purple)' : '2px solid transparent',
            fontFamily: 'DM Sans, sans-serif',
          }}>{l}</button>
        ))}
      </div>

      {/* ── DASHBOARD ── */}
      {aba === 'dashboard' && (
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {[
              { label: 'Simulados', value: simulados.length, unit: '',  icon: '📝', color: '#6366f1' },
              { label: 'Média',     value: mediaGeral,       unit: '%', icon: '📊', color: '#8b5cf6', trend: tendencia },
              { label: 'Melhor',    value: melhorNota,       unit: '%', icon: '⭐', color: '#f59e0b' },
            ].map(s => (
              <div key={s.label} style={{
                background: 'white', borderRadius: 14, padding: '14px 10px',
                border: '0.5px solid rgba(0,0,0,0.08)',
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)', textAlign: 'center',
              }}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1 }}>
                  {s.value}{s.unit}
                </div>
                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4, fontWeight: 500 }}>{s.label}</div>
                {'trend' in s && s.trend !== null && s.trend !== undefined && (
                  <div style={{ fontSize: 10, color: s.trend >= 0 ? '#22c55e' : '#ef4444', marginTop: 2, fontWeight: 600 }}>
                    {s.trend >= 0 ? '▲' : '▼'} {Math.abs(s.trend)}pp
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* S-Curve */}
          <div style={{
            background: 'white', borderRadius: 16, padding: '18px 14px 14px',
            border: '0.5px solid rgba(0,0,0,0.08)',
            boxShadow: '0 2px 10px rgba(99,102,241,0.08)',
          }}>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a' }}>Curva de Aprendizado</div>
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                Progressão ao longo dos simulados · curva sigmoide de referência
              </div>
            </div>
            <SCurveChart simulados={simulados} />
          </div>

          {/* Radar */}
          <div style={{
            background: 'white', borderRadius: 16, padding: '18px 14px 10px',
            border: '0.5px solid rgba(0,0,0,0.08)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Desempenho por Matéria</div>
            <div style={{ fontSize: 11, color: '#aaa', marginBottom: 10 }}>Acertos em questões objetivas</div>
            <RadarChart scores={materias} />
          </div>

          {/* Materia ranking bars */}
          {materias.length > 0 && (
            <div style={{
              background: 'white', borderRadius: 16, padding: '18px 16px',
              border: '0.5px solid rgba(0,0,0,0.08)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Ranking por Matéria</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {[...materias].sort((a, b) => b.pct - a.pct).map((m, idx) => {
                  const cor = CORES[m.materia] || '#8b5cf6'
                  return (
                    <div key={m.materia}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            width: 18, height: 18, borderRadius: '50%', background: cor + '20', color: cor,
                            fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>{idx + 1}</span>
                          <span style={{ fontSize: 13, color: '#1a1a1a', fontWeight: 500 }}>{m.materia}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, color: '#9ca3af' }}>{m.acertos}/{m.total}</span>
                          <span style={{
                            background: cor + '18', color: cor,
                            fontSize: 12, fontWeight: 700, padding: '2px 9px', borderRadius: 20,
                          }}>{m.pct}%</span>
                        </div>
                      </div>
                      <div style={{ height: 7, borderRadius: 4, background: '#F1F5F9', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${m.pct}%`, borderRadius: 4, background: cor, transition: 'width 0.7s ease' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Simulados history */}
          {simulados.length > 0 && (
            <div style={{
              background: 'white', borderRadius: 16, padding: '18px 16px',
              border: '0.5px solid rgba(0,0,0,0.08)',
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Histórico de Simulados</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[...simulados].reverse().map((sim, i) => {
                  const isLatest = i === 0
                  const corFundo = sim.pct >= 65 ? '#DCFCE7' : sim.pct >= 40 ? '#FEF9C3' : '#FEE2E2'
                  const corTexto = sim.pct >= 65 ? '#166534' : sim.pct >= 40 ? '#854d0e' : '#991b1b'
                  return (
                    <button
                      key={sim.simulado_id}
                      onClick={() => alunoId && router.push(`/med/alunos/${alunoId}/simulados/${sim.simulado_id}`)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                        background: isLatest ? '#F5F3FF' : '#FAFAFA',
                        borderRadius: 12, padding: '12px 14px',
                        border: `0.5px solid ${isLatest ? 'rgba(99,102,241,0.25)' : 'rgba(0,0,0,0.06)'}`,
                        cursor: 'pointer', width: '100%', textAlign: 'left',
                        fontFamily: 'DM Sans, sans-serif',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {isLatest && (
                          <div style={{ marginBottom: 3 }}>
                            <span style={{ fontSize: 9, fontWeight: 700, color: '#6366f1', background: '#EDE9FE', padding: '1px 7px', borderRadius: 10 }}>
                              MAIS RECENTE
                            </span>
                          </div>
                        )}
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {sim.nome}
                        </div>
                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
                          {sim.pontos_objetiva}/{sim.total_respostas} acertos
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <div style={{ background: corFundo, color: corTexto, fontSize: 14, fontWeight: 800, padding: '4px 12px', borderRadius: 20 }}>
                          {sim.pct}%
                        </div>
                        <span style={{ color: '#d1d5db', fontSize: 18, lineHeight: 1 }}>›</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {simulados.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '36px 24px',
              background: 'white', borderRadius: 16,
              border: '0.5px solid rgba(0,0,0,0.08)',
            }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🚀</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Tudo pronto para começar!</div>
              <div style={{ fontSize: 13, color: '#aaa', lineHeight: 1.7 }}>
                Assim que você realizar seu primeiro simulado,<br />
                seu dashboard completo aparecerá aqui.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MEUS DADOS ── */}
      {aba === 'dados' && (
        <div style={{ padding: '16px', maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {sucesso && (
            <div style={{ background: '#F0FDF4', color: '#166534', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 500 }}>
              {sucesso}
            </div>
          )}

          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: '#666', display: 'block', marginBottom: 6 }}>Nome</label>
            <div style={{ ...inp, background: '#F8FAFC', color: '#888' }}>{aluno.nome}</div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: '#666', display: 'block', marginBottom: 6 }}>E-mail</label>
            <div style={{ ...inp, background: '#F8FAFC', color: '#888' }}>{aluno.email}</div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: '#666', display: 'block', marginBottom: 6 }}>Celular (WhatsApp)</label>
            <input style={inp} value={telefone} onChange={e => setTelefone(formatTelefone(e.target.value))} placeholder="(11) 99999-9999" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#666', display: 'block', marginBottom: 6 }}>UF</label>
              <select style={inp} value={uf} onChange={e => setUf(e.target.value)}>
                <option value="">—</option>
                {UFS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#666', display: 'block', marginBottom: 6 }}>Cidade</label>
              <input style={inp} value={cidade} onChange={e => setCidade(e.target.value)} placeholder="Ex: São Paulo" />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: '#666', display: 'block', marginBottom: 6 }}>Vestibulares de interesse</label>
            <div style={{ border: '1px solid rgba(0,0,0,0.12)', borderRadius: 10, overflow: 'hidden' }}>
              <button onClick={() => setVestOpen(v => !v)} style={{
                width: '100%', padding: '10px 14px', background: 'white', border: 'none',
                cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontSize: 13, fontFamily: 'DM Sans, sans-serif', color: vestibulares.length ? '#1a1a1a' : '#aaa',
              }}>
                <span>{vestibulares.length > 0 ? `${vestibulares.length} selecionado(s)` : 'Selecionar vestibulares'}</span>
                {vestOpen ? <ChevronUp size={16} color="#888" /> : <ChevronDown size={16} color="#888" />}
              </button>
              {vestOpen && (
                <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(0,0,0,0.08)', display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                  {VESTIBULARES.map(v => (
                    <button key={v} onClick={() => toggleVest(v)} style={{
                      padding: '4px 10px', borderRadius: 20, border: '1px solid', cursor: 'pointer',
                      fontSize: 12, fontWeight: 500, fontFamily: 'DM Sans, sans-serif',
                      background: vestibulares.includes(v) ? 'var(--purple)' : 'white',
                      borderColor: vestibulares.includes(v) ? 'var(--purple)' : 'rgba(0,0,0,0.15)',
                      color: vestibulares.includes(v) ? 'white' : '#555',
                    }}>{v}</button>
                  ))}
                </div>
              )}
              {vestibulares.length > 0 && (
                <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(0,0,0,0.06)', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {vestibulares.map(v => (
                    <span key={v} style={{
                      background: 'var(--purple-light)', color: 'var(--purple)',
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12,
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      {v}
                      <button onClick={() => toggleVest(v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
                        <X size={10} color="var(--purple)" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button onClick={salvar} disabled={salvando} style={{
            padding: 14, borderRadius: 12, border: 'none',
            background: salvando ? '#ccc' : 'var(--purple)',
            color: 'white', fontSize: 15, fontWeight: 600,
            cursor: salvando ? 'not-allowed' : 'pointer',
            fontFamily: 'DM Sans, sans-serif',
          }}>
            {salvando ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      )}
    </div>
  )
}
