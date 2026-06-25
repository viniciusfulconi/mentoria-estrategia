'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { dbQuery, dbUpdate, supabase } from '@/lib/supabase'
import { ArrowLeft, Trophy, Clock, Users, ArrowUpDown, FileText, Upload } from 'lucide-react'
import { BarChart } from '@/components/aluno/AlunoCharts'
import { corMateria } from '@/lib/cores'
import Nav from '@/components/Nav'

const TIPO_LABEL: Record<string, string> = { ime: 'IME', ita: 'ITA' }

type Aba    = 'ranking' | 'materias' | 'questoes' | 'distribuicao'
type Filtro = 'todos'   | 'corrigida' | 'pendente'

const EXATAS = ['Matemática', 'Física', 'Química']

type EntradaRanking = {
  aluno_id: string
  nome: string
  pontos: number | null
  total: number
  pct: number | null
  pontosSemIngles: number | null
  pontosExatas: number | null
  data_correcao: string | null
  porMateria: Record<string, number> | null
  chute?: number
  besteira?: number
  nao_sabia?: number
}

type QuestaoStats = {
  numero: number
  materia: string
  acertou: number
  chute: number
  besteira: number
  nao_sabia: number
  tempo: number
  total: number
  pct_acerto: number
  media_nota: number
  pct_abaixo07: number
}

type MateriaStats = {
  nome: string
  totalQuestoes: number
  pctMedia: number
  acertou: number
  chute: number
  besteira: number
  nao_sabia: number
  tempo: number
  totalRespostas: number
  pct_abaixo07: number
}

const ABREV: Record<string, string> = {
  'Física': 'Fís', 'Matemática': 'Mat', 'Química': 'Quí',
  'Português': 'Port', 'Inglês': 'Ing', 'Redação': 'Red',
  'Biologia': 'Bio', 'História': 'Hist', 'Geografia': 'Geo',
}
function abreviar(mat: string) { return ABREV[mat] ?? mat.slice(0, 4) }

const medalEmoji = ['🥇', '🥈', '🥉']
const medalColor = ['#f59e0b', '#94a3b8', '#b45309']

const TIPO_ERRO = [
  { key: 'acertou',   label: 'Acertou',   cor: '#16a34a' },
  { key: 'chute',     label: 'Chute',     cor: '#d97706' },
  { key: 'besteira',  label: 'Besteira',  cor: '#ea580c' },
  { key: 'nao_sabia', label: 'Não sabia', cor: '#dc2626' },
  { key: 'tempo',     label: 'Tempo',     cor: '#94a3b8' },
] as const

function diffColor(pct: number) {
  return pct >= 60 ? '#16a34a' : pct >= 40 ? '#d97706' : '#dc2626'
}

export default function RankingProvaAntigaPage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [prova,          setProva]          = useState<any>(null)
  const [ranking,        setRanking]        = useState<EntradaRanking[]>([])
  const [materias,       setMaterias]       = useState<string[]>([])
  const [totalPorMateria,setTotalPorMateria]= useState<Record<string, number>>({})
  const [totalSemIngles, setTotalSemIngles] = useState(0)
  const [questaoStats,   setQuestaoStats]   = useState<QuestaoStats[]>([])
  const [materiaStats,   setMateriaStats]   = useState<MateriaStats[]>([])
  const [fetching,       setFetching]       = useState(true)
  const [aba,            setAba]            = useState<Aba>('ranking')
  const [filtro,         setFiltro]         = useState<Filtro>('todos')
  const [sortQuestoes,   setSortQuestoes]   = useState<'numero' | 'dificuldade'>('numero')
  const [uploadingRes,   setUploadingRes]   = useState(false)
  const [resErro,        setResErro]        = useState('')

  // Só coordenador/direção edita (envia resolução). Mentor ITA vê tudo em modo leitura.
  const podeEditar = perfil?.papel === 'coordenador' || perfil?.papel === 'direcao'

  useEffect(() => {
    if (!loading && !perfil) router.replace('/login')
  }, [loading, perfil, router])

  useEffect(() => {
    if (!perfil || !id) return
    // Coordenador/direção: acesso total. Mentor ITA: leitura (sem editar). Demais: bloqueado.
    const isGestor = perfil.papel === 'coordenador' || perfil.papel === 'direcao'
    const isMentorITA = perfil.papel === 'mentor' && perfil.vertical !== 'Medicina'
    if (!isGestor && !isMentorITA) {
      router.replace('/provas-antigas')
      return
    }
    load()
  }, [perfil, id])

  async function load() {
    setFetching(true)
    const [
      { data: provaData },
      { data: questoesData },
      { data: atribuicoes },
      { data: correcoes },
      { data: alunos },
    ] = await Promise.all([
      dbQuery('provas_antigas',       { id: `eq.${id}` }),
      dbQuery('questoes_prova_antiga',{ prova_id: `eq.${id}`, order: 'numero' }),
      dbQuery('provas_aluno',         { prova_id: `eq.${id}` }, 'aluno_id,data'),
      dbQuery('correcoes_prova',      { prova_id: `eq.${id}`, confirmed_at: 'not.is.null' }, 'aluno_id,respostas,notas,confirmed_at'),
      dbQuery('alunos_dados',         { order: 'nome' }, 'id_aluno,nome'),
    ])

    const p = provaData?.[0]
    setProva(p)
    if (!p) { setFetching(false); return }

    // ── Árvore de questões ────────────────────────────────────────────────────
    const questaoMateria: Record<number, string> = {}
    const totPorMat: Record<string, number> = {}
    ;(questoesData || []).forEach((q: any) => {
      questaoMateria[q.numero] = q.materia
      totPorMat[q.materia] = (totPorMat[q.materia] || 0) + 1
    })
    const materiasList = Object.keys(totPorMat).sort()
    setMaterias(materiasList)
    setTotalPorMateria(totPorMat)
    setTotalSemIngles(p.num_questoes - (totPorMat['Inglês'] || 0))

    // ── Mapas auxiliares ──────────────────────────────────────────────────────
    const nomeMap: Record<string, string> = {}
    ;(alunos || []).forEach((a: any) => { nomeMap[a.id_aluno] = a.nome })

    const correcaoMap: Record<string, any> = {}
    ;(correcoes || []).forEach((c: any) => { correcaoMap[c.aluno_id] = c })

    const nCorrigidos = (correcoes || []).length

    // ── Ranking ───────────────────────────────────────────────────────────────
    const lista: EntradaRanking[] = (atribuicoes || []).map((a: any) => {
      const c = correcaoMap[a.aluno_id]
      const total = p.num_questoes
      if (!c) {
        return {
          aluno_id: a.aluno_id, nome: nomeMap[a.aluno_id] || a.aluno_id,
          pontos: null, total, pct: null, pontosSemIngles: null, pontosExatas: null, data_correcao: null, porMateria: null,
        }
      }
      if (p.modelo === 'multipla_escolha') {
        const resps: Record<string, string> = c.respostas || {}
        const porMateria: Record<string, number> = {}
        let acertouTotal = 0, chute = 0, besteira = 0, nao_sabia = 0
        Object.entries(resps).forEach(([numStr, val]) => {
          const mat = questaoMateria[parseInt(numStr)]
          // Acertou no chute conta como acerto (mais realista com o ITA); a categoria
          // 'chute' segue contabilizada à parte só para diagnóstico (abas Matérias/Questões).
          if (val === 'acertou' || val === 'chute') { acertouTotal++; if (mat) porMateria[mat] = (porMateria[mat] || 0) + 1 }
          if (val === 'chute')    chute++
          if (val === 'besteira') besteira++
          if (val === 'nao_sabia') nao_sabia++
        })
        const pontosExatas = EXATAS.reduce((acc, m) => acc + (porMateria[m] || 0), 0)
        return {
          aluno_id: a.aluno_id, nome: nomeMap[a.aluno_id] || a.aluno_id,
          pontos: acertouTotal, total,
          pct: Math.round((acertouTotal / total) * 100),
          pontosSemIngles: acertouTotal - (porMateria['Inglês'] || 0),
          pontosExatas,
          data_correcao: c.confirmed_at,
          porMateria, chute, besteira, nao_sabia,
        }
      } else {
        const notas: Record<string, number> = c.notas || {}
        const porMateria: Record<string, number> = {}
        Object.entries(notas).forEach(([numStr, val]) => {
          const mat = questaoMateria[parseInt(numStr)]
          if (mat) porMateria[mat] = parseFloat(((porMateria[mat] || 0) + Number(val || 0)).toFixed(2))
        })
        const soma = Object.values(notas).reduce((acc, v) => acc + Number(v || 0), 0)
        const somaSemIngles = soma - (porMateria['Inglês'] || 0)
        const pontosExatas = parseFloat(EXATAS.reduce((acc, m) => acc + (porMateria[m] || 0), 0).toFixed(2))
        return {
          aluno_id: a.aluno_id, nome: nomeMap[a.aluno_id] || a.aluno_id,
          pontos: parseFloat(soma.toFixed(1)), total,
          pct: total > 0 ? Math.round((soma / total) * 100) : 0,
          pontosSemIngles: parseFloat(somaSemIngles.toFixed(1)),
          pontosExatas,
          data_correcao: c.confirmed_at, porMateria,
        }
      }
    })
    lista.sort((a, b) => {
      if (a.pontosExatas !== null && b.pontosExatas !== null) {
        const diff = b.pontosExatas - a.pontosExatas
        if (diff !== 0) return diff
        return (a.nome || '').localeCompare(b.nome || '')
      }
      if (a.pontosExatas !== null) return -1
      if (b.pontosExatas !== null) return 1
      return (a.nome || '').localeCompare(b.nome || '')
    })
    setRanking(lista)

    // ── Stats por questão e matéria ───────────────────────────────────────────
    if (p.modelo === 'multipla_escolha') {
      const qAcc: Record<number, { numero: number; materia: string; acertou: number; chute: number; besteira: number; nao_sabia: number; tempo: number; total: number }> = {}
      ;(questoesData || []).forEach((q: any) => {
        qAcc[q.numero] = { numero: q.numero, materia: q.materia, acertou: 0, chute: 0, besteira: 0, nao_sabia: 0, tempo: 0, total: 0 }
      })
      const mAcc: Record<string, { acertou: number; chute: number; besteira: number; nao_sabia: number; tempo: number; totalRespostas: number }> = {}
      Object.keys(totPorMat).forEach(mat => {
        mAcc[mat] = { acertou: 0, chute: 0, besteira: 0, nao_sabia: 0, tempo: 0, totalRespostas: 0 }
      })
      ;(correcoes || []).forEach((c: any) => {
        const resps: Record<string, string> = c.respostas || {}
        Object.entries(resps).forEach(([numStr, val]) => {
          const num = parseInt(numStr)
          const mat = questaoMateria[num]
          const q = qAcc[num]
          if (!q) return
          q.total++
          if (val === 'acertou')   q.acertou++
          if (val === 'chute')     q.chute++
          if (val === 'besteira')  q.besteira++
          if (val === 'nao_sabia') q.nao_sabia++
          if (val === 'tempo')     q.tempo++
          if (mat && mAcc[mat]) {
            mAcc[mat].acertou   += val === 'acertou'   ? 1 : 0
            mAcc[mat].chute     += val === 'chute'     ? 1 : 0
            mAcc[mat].besteira  += val === 'besteira'  ? 1 : 0
            mAcc[mat].nao_sabia += val === 'nao_sabia' ? 1 : 0
            mAcc[mat].tempo     += val === 'tempo'     ? 1 : 0
            mAcc[mat].totalRespostas++
          }
        })
      })
      setQuestaoStats(
        Object.values(qAcc).map(q => ({
          ...q, pct_acerto: q.total > 0 ? Math.round((q.acertou / q.total) * 100) : 0,
          media_nota: 0, pct_abaixo07: 0,
        }))
      )
      setMateriaStats(
        Object.entries(mAcc).map(([nome, acc]) => ({
          nome,
          totalQuestoes: totPorMat[nome] || 0,
          pctMedia: acc.totalRespostas > 0 ? Math.round((acc.acertou / acc.totalRespostas) * 100) : 0,
          ...acc,
          pct_abaixo07: 0,
        })).sort((a, b) => a.nome.localeCompare(b.nome))
      )
    } else {
      const qAcc: Record<number, { materia: string; soma: number; count: number; abaixo07: number }> = {}
      ;(questoesData || []).forEach((q: any) => {
        qAcc[q.numero] = { materia: q.materia, soma: 0, count: 0, abaixo07: 0 }
      })
      const mAcc: Record<string, { soma: number; count: number; abaixo07: number }> = {}
      Object.keys(totPorMat).forEach(mat => { mAcc[mat] = { soma: 0, count: 0, abaixo07: 0 } })
      ;(correcoes || []).forEach((c: any) => {
        const notas: Record<string, number> = c.notas || {}
        Object.entries(notas).forEach(([numStr, val]) => {
          const num = parseInt(numStr)
          const mat = questaoMateria[num]
          const nota = Number(val || 0)
          if (qAcc[num]) {
            qAcc[num].soma += nota
            qAcc[num].count++
            if (nota < 0.7) qAcc[num].abaixo07++
          }
          if (mat && mAcc[mat]) {
            mAcc[mat].soma += nota
            mAcc[mat].count++
            if (nota < 0.7) mAcc[mat].abaixo07++
          }
        })
      })
      setQuestaoStats(
        (questoesData || []).map((q: any) => {
          const acc = qAcc[q.numero] || { soma: 0, count: 0, abaixo07: 0 }
          const media = acc.count > 0 ? acc.soma / acc.count : 0
          return {
            numero: q.numero, materia: q.materia,
            acertou: 0, chute: 0, besteira: 0, nao_sabia: 0, tempo: 0,
            total: acc.count, pct_acerto: Math.round(media * 100),
            media_nota: parseFloat(media.toFixed(2)),
            pct_abaixo07: acc.count > 0 ? Math.round((acc.abaixo07 / acc.count) * 100) : 0,
          }
        })
      )
      setMateriaStats(
        Object.entries(mAcc).map(([nome, acc]) => {
          const totalQ = totPorMat[nome] || 0
          const maxPossivel = nCorrigidos * totalQ
          return {
            nome, totalQuestoes: totalQ,
            pctMedia: maxPossivel > 0 ? Math.round((acc.soma / maxPossivel) * 100) : 0,
            acertou: 0, chute: 0, besteira: 0, nao_sabia: 0, tempo: 0,
            totalRespostas: acc.count,
            pct_abaixo07: acc.count > 0 ? Math.round((acc.abaixo07 / acc.count) * 100) : 0,
          }
        }).sort((a, b) => a.nome.localeCompare(b.nome))
      )
    }

    setFetching(false)
  }

  async function uploadResolucao(file: File) {
    if (!prova) return
    setResErro('')
    setUploadingRes(true)
    // Supabase Storage não aceita acentos, ª/º, ç ou espaços na key
    const safeName = file.name
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
    const path = `${prova.tipo}-fase${prova.fase}/resolucao-${Date.now()}-${safeName}`
    const { error: upErr } = await supabase.storage.from('provas-antigas').upload(path, file, { upsert: true })
    if (upErr) { setResErro('Erro ao enviar: ' + upErr.message); setUploadingRes(false); return }
    const { data: urlData } = supabase.storage.from('provas-antigas').getPublicUrl(path)
    const { error: dbErr } = await dbUpdate('provas_antigas', { id: `eq.${prova.id}` }, { pdf_resolucao_url: urlData.publicUrl })
    if (dbErr) { setResErro('Erro ao salvar: ' + dbErr); setUploadingRes(false); return }
    setProva({ ...prova, pdf_resolucao_url: urlData.publicUrl })
    setUploadingRes(false)
  }

  if (loading || !perfil) return null

  const corrigidas = ranking.filter(r => r.pontos !== null)
  const pendentes  = ranking.filter(r => r.pontos === null)
  const listaFiltrada = filtro === 'corrigida' ? corrigidas : filtro === 'pendente' ? pendentes : ranking

  const questoesSorted = sortQuestoes === 'dificuldade'
    ? [...questaoStats].sort((a, b) => a.pct_acerto - b.pct_acerto)
    : [...questaoStats].sort((a, b) => a.numero - b.numero)

  // Histogram (distribuição)
  const scores = corrigidas.map(e => e.pontos!).sort((a, b) => a - b)
  const binSize = Math.max(1, Math.ceil((prova?.num_questoes || 1) / 8))
  const nBins   = Math.ceil(((prova?.num_questoes || 1) + 1) / binSize)
  const bins    = Array(nBins).fill(0)
  scores.forEach(s => { bins[Math.min(Math.floor(s / binSize), nBins - 1)]++ })
  const maxBin  = Math.max(...bins, 1)
  const mediaScore  = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
  const medianaScore= scores.length ? scores[Math.floor(scores.length / 2)] : 0

  const ABA_LABELS: Record<Aba, string> = {
    ranking: 'Ranking', materias: 'Matérias', questoes: 'Questões', distribuicao: 'Distribuição',
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, background: '#F7F6F3', zIndex: 10,
        padding: '16px 16px 14px', borderBottom: '1px solid #e2e8f0',
      }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/provas-antigas" style={{ color: '#64748b', display: 'flex' }}>
            <ArrowLeft size={20} strokeWidth={2} />
          </Link>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {prova?.nome || 'Carregando…'}
            </div>
            {prova && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                {TIPO_LABEL[prova.tipo] || prova.tipo} · {prova.fase}ª Fase · {prova.num_questoes} questões · {prova.modelo === 'multipla_escolha' ? 'Múltipla escolha' : 'Discursiva'}
              </div>
            )}
          </div>
        </div>
      </div>

      {fetching ? (
        <div style={{ padding: '60px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Carregando…</div>
      ) : !prova ? (
        <div style={{ padding: '60px 16px', textAlign: 'center', color: '#64748b', fontSize: 14 }}>Prova não encontrada.</div>
      ) : (
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── Stats cards ────────────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {[
              { label: 'Atribuídos', value: ranking.length,    icon: <Users size={14} />,  color: '#0f2554', border: '#bfdbfe' },
              { label: 'Corrigiram', value: corrigidas.length, icon: <Trophy size={14} />, color: '#16a34a', border: '#bbf7d0' },
              { label: 'Pendentes',  value: pendentes.length,  icon: <Clock size={14} />,  color: '#d97706', border: '#fde68a' },
            ].map(s => (
              <div key={s.label} style={{ background: 'white', border: `1.5px solid ${s.border}`, borderRadius: 12, padding: '14px 10px', textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, color: s.color, marginBottom: 6 }}>
                  {s.icon}
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</span>
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* ── PDFs: prova + resolução ────────────────────────────────────── */}
          <div style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <FileText size={16} strokeWidth={2} color="#5B21B6" />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>PDF da prova</span>
              </div>
              {prova.pdf_url ? (
                <a href={prova.pdf_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#5B21B6', textDecoration: 'none', padding: '5px 12px', border: '1.5px solid #5B21B6', borderRadius: 8, fontWeight: 600 }}>
                  Abrir
                </a>
              ) : (
                <span style={{ fontSize: 11, color: '#94a3b8' }}>não enviado</span>
              )}
            </div>

            <div style={{ height: 1, background: '#f1f5f9' }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <FileText size={16} strokeWidth={2} color="#f97316" />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>PDF de resolução</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Liberado ao aluno só depois da correção</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {prova.pdf_resolucao_url ? (
                  <a href={prova.pdf_resolucao_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#f97316', textDecoration: 'none', padding: '5px 12px', border: '1.5px solid #f97316', borderRadius: 8, fontWeight: 600 }}>
                    Abrir
                  </a>
                ) : !podeEditar ? (
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>não enviado</span>
                ) : null}
                {podeEditar && (
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#475569', padding: '5px 12px', border: '1.5px dashed #cbd5e1', borderRadius: 8, cursor: uploadingRes ? 'wait' : 'pointer', fontWeight: 600 }}>
                    <Upload size={12} strokeWidth={2} />
                    {uploadingRes ? 'Enviando…' : prova.pdf_resolucao_url ? 'Trocar' : 'Enviar'}
                    <input
                      type="file"
                      accept="application/pdf"
                      disabled={uploadingRes}
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadResolucao(f); e.target.value = '' }}
                      style={{ display: 'none' }}
                    />
                  </label>
                )}
              </div>
            </div>
            {resErro && <div style={{ fontSize: 12, color: '#DC2626' }}>{resErro}</div>}
          </div>

          {/* ── Tabs ───────────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 12, padding: 4, gap: 3 }}>
            {(['ranking', 'materias', 'questoes', 'distribuicao'] as Aba[]).map(a => (
              <button key={a} onClick={() => setAba(a)} style={{
                flex: 1, padding: '8px 4px', borderRadius: 9, border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 12, fontWeight: aba === a ? 700 : 500,
                background: aba === a ? 'white' : 'transparent',
                color: aba === a ? '#0f2554' : '#64748b',
                boxShadow: aba === a ? '0 1px 4px rgba(9,30,66,0.12)' : 'none',
                transition: 'all 0.15s',
              }}>
                {ABA_LABELS[a]}
              </button>
            ))}
          </div>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* ABA: RANKING                                                      */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {aba === 'ranking' && (
            <>
              {/* Filtros */}
              <div style={{ display: 'flex', gap: 6 }}>
                {([['todos', 'Todos'], ['corrigida', 'Corrigiram'], ['pendente', 'Pendentes']] as [Filtro, string][]).map(([v, l]) => (
                  <button key={v} onClick={() => setFiltro(v)} style={{
                    padding: '7px 14px', borderRadius: 20,
                    border: `1.5px solid ${filtro === v ? '#f97316' : '#e2e8f0'}`,
                    background: filtro === v ? '#fff7ed' : 'white',
                    color: filtro === v ? '#f97316' : '#64748b',
                    fontSize: 13, fontWeight: filtro === v ? 700 : 400,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    {l}
                  </button>
                ))}
              </div>

              {listaFiltrada.length === 0 ? (
                <div style={{ padding: '48px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                  {filtro === 'corrigida' ? 'Nenhuma correção registrada ainda.'
                    : filtro === 'pendente' ? 'Todos os alunos já corrigiram!'
                    : 'Nenhum aluno atribuído a esta prova.'}
                </div>
              ) : (
                <div style={{ overflowX: 'auto', borderRadius: 12, border: '1.5px solid #e2e8f0' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: 'white' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0' }}>
                        <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', position: 'sticky', left: 0, background: '#f8fafc', zIndex: 2, minWidth: 200, whiteSpace: 'nowrap', borderRight: '1.5px solid #e2e8f0' }}>
                          Aluno
                        </th>
                        {materias.map(mat => (
                          <th key={mat} style={{ textAlign: 'center', padding: '10px 10px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 64, whiteSpace: 'nowrap' }}>
                            <div>{abreviar(mat)}</div>
                            <div style={{ fontWeight: 400, fontSize: 10, color: '#94a3b8', marginTop: 2 }}>/{totalPorMateria[mat]}</div>
                          </th>
                        ))}
                        {totalSemIngles < prova.num_questoes && (
                          <th style={{ textAlign: 'center', padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 76, whiteSpace: 'nowrap', borderLeft: '1.5px solid #e2e8f0', background: '#faf5ff' }}>
                            <div>s/ Ing</div>
                            <div style={{ fontWeight: 400, fontSize: 10, color: '#a78bfa', marginTop: 2 }}>/{totalSemIngles}</div>
                          </th>
                        )}
                        <th style={{ textAlign: 'center', padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#0f2554', textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 72, whiteSpace: 'nowrap', borderLeft: '1.5px solid #e2e8f0' }}>
                          <div>Total</div>
                          <div style={{ fontWeight: 400, fontSize: 10, color: '#94a3b8', marginTop: 2 }}>/{prova.num_questoes}</div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {listaFiltrada.map((entry, listIdx) => {
                        const posicao = corrigidas.indexOf(entry) + 1
                        const isPendente = entry.pontos === null
                        const isMedal = !isPendente && posicao >= 1 && posicao <= 3
                        const rowBg = isMedal ? medalColor[posicao - 1] + '0d' : 'white'
                        return (
                          <tr key={entry.aluno_id} style={{ borderBottom: listIdx < listaFiltrada.length - 1 ? '1px solid #f1f5f9' : 'none', opacity: isPendente ? 0.6 : 1 }}>
                            <td style={{ padding: '12px 16px', position: 'sticky', left: 0, background: rowBg, zIndex: 1, borderRight: '1.5px solid #f1f5f9' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isPendente ? '#f1f5f9' : isMedal ? medalColor[posicao - 1] + '22' : '#f1f5f9', fontSize: isMedal ? 15 : 12, fontWeight: 800, color: isPendente ? '#94a3b8' : isMedal ? medalColor[posicao - 1] : '#475569' }}>
                                  {isPendente ? '–' : isMedal ? medalEmoji[posicao - 1] : posicao}
                                </div>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontWeight: 600, color: '#1a1a1a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>{entry.nome}</div>
                                  {isPendente
                                    ? <div style={{ fontSize: 11, color: '#d97706', marginTop: 1, fontWeight: 600 }}>Pendente</div>
                                    : entry.data_correcao
                                    ? <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{new Date(entry.data_correcao).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                                    : null}
                                </div>
                              </div>
                            </td>
                            {materias.map(mat => {
                              const val = entry.porMateria?.[mat]
                              const tot = totalPorMateria[mat]
                              const pctMat = val != null && tot > 0 ? val / tot : null
                              return (
                                <td key={mat} style={{ textAlign: 'center', padding: '12px 10px', background: rowBg }}>
                                  {val != null
                                    ? <span style={{ fontSize: 14, fontWeight: 700, color: diffColor(pctMat! * 100) }}>{prova.modelo === 'multipla_escolha' ? val : val.toFixed(1)}</span>
                                    : <span style={{ color: '#cbd5e1', fontSize: 13 }}>–</span>}
                                </td>
                              )
                            })}
                            {totalSemIngles < prova.num_questoes && (
                              <td style={{ textAlign: 'center', padding: '12px 12px', background: isPendente ? 'white' : '#faf5ff', borderLeft: '1.5px solid #f1f5f9' }}>
                                {entry.pontosSemIngles != null
                                  ? <><div style={{ fontSize: 15, fontWeight: 800, color: '#7c3aed' }}>{prova.modelo === 'multipla_escolha' ? entry.pontosSemIngles : entry.pontosSemIngles.toFixed(1)}</div>
                                      <div style={{ fontSize: 11, fontWeight: 700, marginTop: 1, color: '#a78bfa' }}>{totalSemIngles > 0 ? Math.round((entry.pontosSemIngles / totalSemIngles) * 100) : 0}%</div></>
                                  : <span style={{ color: '#cbd5e1', fontSize: 13 }}>–</span>}
                              </td>
                            )}
                            <td style={{ textAlign: 'center', padding: '12px 16px', background: rowBg, borderLeft: '1.5px solid #f1f5f9' }}>
                              {!isPendente
                                ? <><div style={{ fontSize: 15, fontWeight: 800, color: isMedal ? medalColor[posicao - 1] : '#0f2554' }}>{prova.modelo === 'multipla_escolha' ? entry.pontos : entry.pontos?.toFixed(1)}</div>
                                    <div style={{ fontSize: 11, fontWeight: 700, marginTop: 1, color: diffColor(entry.pct || 0) }}>{entry.pct}%</div></>
                                : <span style={{ color: '#cbd5e1', fontSize: 13 }}>–</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* ABA: MATÉRIAS                                                     */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {aba === 'materias' && (
            corrigidas.length === 0 ? (
              <div style={{ padding: '48px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Nenhuma correção registrada ainda.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Média por matéria */}
                <div style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a', marginBottom: 16 }}>
                    Média de acertos por matéria
                  </div>
                  <BarChart dados={materiaStats.map(m => ({ materia: m.nome, pct: m.pctMedia }))} />
                  <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                    {materiaStats.map(m => (
                      <div key={m.nome} style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 12px', borderLeft: `3px solid ${corMateria(m.nome)}` }}>
                        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>{m.nome}</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: corMateria(m.nome) }}>{m.pctMedia}%</div>
                        <div style={{ fontSize: 10, color: '#94a3b8' }}>
                          {prova.modelo === 'multipla_escolha'
                            ? `${(m.acertou / (corrigidas.length || 1)).toFixed(1)} acertos/aluno`
                            : `média ${(m.pct_abaixo07 ? 100 - m.pct_abaixo07 : m.pctMedia)}%`}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Breakdown de erros (múltipla escolha) */}
                {prova.modelo === 'multipla_escolha' && (
                  <div style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a', marginBottom: 6 }}>
                      Distribuição de respostas por matéria
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginBottom: 16 }}>
                      {TIPO_ERRO.map(t => (
                        <span key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#64748b' }}>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: t.cor, display: 'inline-block', flexShrink: 0 }} />
                          {t.label}
                        </span>
                      ))}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {materiaStats.map(m => {
                        const total = m.totalRespostas
                        const segs = TIPO_ERRO.map(t => ({ ...t, val: m[t.key as keyof MateriaStats] as number })).filter(s => s.val > 0)
                        return (
                          <div key={m.nome}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: corMateria(m.nome) }}>{m.nome}</span>
                              <span style={{ fontSize: 11, color: '#94a3b8' }}>{m.totalQuestoes}q × {corrigidas.length} alunos</span>
                            </div>
                            <div style={{ display: 'flex', height: 28, borderRadius: 8, overflow: 'hidden' }}>
                              {segs.map((s, i) => {
                                const pct = total > 0 ? (s.val / total) * 100 : 0
                                return (
                                  <div key={s.key} style={{ width: `${pct}%`, background: s.cor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'white', fontWeight: 700, minWidth: pct > 0 ? 4 : 0, borderRight: i < segs.length - 1 ? '1px solid rgba(255,255,255,0.3)' : 'none' }}>
                                    {pct >= 9 ? `${Math.round(pct)}%` : ''}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Discursiva: % abaixo de 0.7 */}
                {prova.modelo === 'discursiva' && (
                  <div style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a', marginBottom: 16 }}>Questões que precisam de revisão (&lt; 70%)</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {materiaStats.map(m => (
                        <div key={m.nome}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                            <span style={{ fontWeight: 600, color: corMateria(m.nome) }}>{m.nome}</span>
                            <span style={{ fontWeight: 700, color: m.pct_abaixo07 >= 50 ? '#dc2626' : '#d97706' }}>{m.pct_abaixo07}% abaixo de 0.7</span>
                          </div>
                          <div style={{ display: 'flex', height: 12, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden' }}>
                            <div style={{ width: `${100 - m.pct_abaixo07}%`, background: '#16a34a', borderRadius: 6 }} />
                            <div style={{ width: `${m.pct_abaixo07}%`, background: '#dc2626', borderRadius: 6 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* ABA: QUESTÕES                                                     */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {aba === 'questoes' && (
            questaoStats.length === 0 ? (
              <div style={{ padding: '48px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Nenhuma questão cadastrada nesta prova.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 13, color: '#64748b' }}>
                    {questaoStats.length} questões · {corrigidas.length} correção{corrigidas.length !== 1 ? 'ões' : ''}
                  </div>
                  <button
                    onClick={() => setSortQuestoes(s => s === 'numero' ? 'dificuldade' : 'numero')}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: 'white', fontSize: 12, color: '#64748b', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}
                  >
                    <ArrowUpDown size={12} strokeWidth={2} />
                    {sortQuestoes === 'numero' ? 'Ordenar por dificuldade' : 'Ordenar por número'}
                  </button>
                </div>

                {corrigidas.length === 0 ? (
                  <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 14, background: 'white', borderRadius: 12, border: '1.5px solid #e2e8f0' }}>
                    Nenhuma correção ainda — os dados aparecerão aqui quando os alunos corrigirem.
                  </div>
                ) : prova.modelo === 'multipla_escolha' ? (
                  <div style={{ overflowX: 'auto', borderRadius: 12, border: '1.5px solid #e2e8f0' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: 'white' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0' }}>
                          {[
                            { label: '#',        align: 'center' },
                            { label: 'Matéria',  align: 'left'   },
                            { label: '✓ Acertou',align: 'center', cor: '#16a34a' },
                            { label: '~ Chute',  align: 'center', cor: '#d97706' },
                            { label: '✕ Besteira',align:'center', cor: '#ea580c' },
                            { label: '? N.Sabia',align: 'center', cor: '#dc2626' },
                            { label: '⏱ Tempo',  align: 'center', cor: '#94a3b8' },
                            { label: 'Dific.',   align: 'center' },
                          ].map(col => (
                            <th key={col.label} style={{ textAlign: col.align as any, padding: '10px 10px', fontSize: 10, fontWeight: 700, color: (col as any).cor || '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                              {col.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {questoesSorted.map((q, idx) => {
                          const cor = diffColor(q.pct_acerto)
                          const rowBg = q.pct_acerto < 40 ? '#fff5f5' : q.pct_acerto >= 60 ? '#f0fdf4' : 'white'
                          const pct = (v: number) => q.total > 0 ? `${Math.round((v / q.total) * 100)}%` : '–'
                          return (
                            <tr key={q.numero} style={{ borderBottom: idx < questoesSorted.length - 1 ? '1px solid #f1f5f9' : 'none', background: rowBg }}>
                              <td style={{ textAlign: 'center', padding: '10px 10px', fontWeight: 700, color: '#475569', fontSize: 12 }}>{q.numero}</td>
                              <td style={{ padding: '10px 10px', fontWeight: 600, color: corMateria(q.materia), whiteSpace: 'nowrap' }}>{q.materia}</td>
                              <td style={{ textAlign: 'center', padding: '10px 10px' }}>
                                <div style={{ fontWeight: 700, color: '#16a34a' }}>{q.acertou}</div>
                                <div style={{ fontSize: 10, color: '#94a3b8' }}>{pct(q.acertou)}</div>
                              </td>
                              <td style={{ textAlign: 'center', padding: '10px 10px' }}>
                                <div style={{ fontWeight: 600, color: '#d97706' }}>{q.chute}</div>
                                <div style={{ fontSize: 10, color: '#94a3b8' }}>{pct(q.chute)}</div>
                              </td>
                              <td style={{ textAlign: 'center', padding: '10px 10px' }}>
                                <div style={{ fontWeight: 600, color: '#ea580c' }}>{q.besteira}</div>
                                <div style={{ fontSize: 10, color: '#94a3b8' }}>{pct(q.besteira)}</div>
                              </td>
                              <td style={{ textAlign: 'center', padding: '10px 10px' }}>
                                <div style={{ fontWeight: 600, color: '#dc2626' }}>{q.nao_sabia}</div>
                                <div style={{ fontSize: 10, color: '#94a3b8' }}>{pct(q.nao_sabia)}</div>
                              </td>
                              <td style={{ textAlign: 'center', padding: '10px 10px' }}>
                                <div style={{ fontWeight: 600, color: '#94a3b8' }}>{q.tempo}</div>
                                <div style={{ fontSize: 10, color: '#94a3b8' }}>{pct(q.tempo)}</div>
                              </td>
                              <td style={{ textAlign: 'center', padding: '10px 14px' }}>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: cor + '18', borderRadius: 20, padding: '3px 10px' }}>
                                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: cor, flexShrink: 0 }} />
                                  <span style={{ fontSize: 12, fontWeight: 800, color: cor }}>{q.pct_acerto}%</span>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  /* Discursiva: tabela simplificada */
                  <div style={{ overflowX: 'auto', borderRadius: 12, border: '1.5px solid #e2e8f0' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: 'white' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0' }}>
                          {['#', 'Matéria', 'Média', '< 0.7', 'Dific.'].map(l => (
                            <th key={l} style={{ textAlign: l === 'Matéria' ? 'left' : 'center', padding: '10px 12px', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{l}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {questoesSorted.map((q, idx) => {
                          const cor = diffColor(q.pct_acerto)
                          return (
                            <tr key={q.numero} style={{ borderBottom: idx < questoesSorted.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                              <td style={{ textAlign: 'center', padding: '10px 12px', fontWeight: 700, color: '#475569' }}>{q.numero}</td>
                              <td style={{ padding: '10px 12px', fontWeight: 600, color: corMateria(q.materia) }}>{q.materia}</td>
                              <td style={{ textAlign: 'center', padding: '10px 12px', fontWeight: 700, color: cor }}>{q.media_nota.toFixed(2)}</td>
                              <td style={{ textAlign: 'center', padding: '10px 12px' }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: q.pct_abaixo07 >= 50 ? '#dc2626' : '#d97706' }}>{q.pct_abaixo07}%</span>
                              </td>
                              <td style={{ textAlign: 'center', padding: '10px 14px' }}>
                                <span style={{ fontSize: 12, fontWeight: 800, color: cor, background: cor + '18', borderRadius: 20, padding: '3px 10px' }}>{q.pct_acerto}%</span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* ABA: DISTRIBUIÇÃO                                                 */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {aba === 'distribuicao' && (
            corrigidas.length === 0 ? (
              <div style={{ padding: '48px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Nenhuma correção registrada ainda.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Cards de stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                  {[
                    { label: 'Média',   value: prova.modelo === 'multipla_escolha' ? mediaScore.toFixed(1) : mediaScore.toFixed(2) },
                    { label: 'Mediana', value: prova.modelo === 'multipla_escolha' ? medianaScore.toFixed(0) : medianaScore.toFixed(1) },
                    { label: 'Mínimo',  value: scores.length ? (prova.modelo === 'multipla_escolha' ? scores[0].toFixed(0) : scores[0].toFixed(1)) : '–' },
                    { label: 'Máximo',  value: scores.length ? (prova.modelo === 'multipla_escolha' ? scores[scores.length - 1].toFixed(0) : scores[scores.length - 1].toFixed(1)) : '–' },
                  ].map(s => (
                    <div key={s.label} style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '14px 10px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{s.label}</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: '#0f2554' }}>{s.value}</div>
                      <div style={{ fontSize: 9, color: '#cbd5e1', marginTop: 1 }}>de {prova.num_questoes}</div>
                    </div>
                  ))}
                </div>

                {/* Histograma */}
                <div style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a', marginBottom: 16 }}>Distribuição de pontuações</div>
                  <svg viewBox={`0 0 ${nBins * 36 + 28} 160`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
                    {/* Grid lines */}
                    {[0.25, 0.5, 0.75, 1].map(v => (
                      <line key={v} x1={22} x2={nBins * 36 + 22} y1={130 - v * 100} y2={130 - v * 100}
                        stroke="rgba(0,0,0,0.06)" strokeWidth={1} strokeDasharray={v < 1 ? '4,3' : undefined} />
                    ))}
                    {/* Bars */}
                    {bins.map((count, i) => {
                      const x = i * 36 + 24
                      const barH = maxBin > 0 ? (count / maxBin) * 100 : 0
                      const rangeStart = i * binSize
                      const rangeEnd = Math.min((i + 1) * binSize - 1, prova.num_questoes)
                      const pctRange = rangeStart / prova.num_questoes
                      const barColor = pctRange >= 0.6 ? '#16a34a' : pctRange >= 0.4 ? '#d97706' : '#dc2626'
                      return (
                        <g key={i}>
                          <rect x={x} y={130 - barH} width={28} height={barH} fill={barColor} fillOpacity={count === 0 ? 0 : 1} rx={3} />
                          {count > 0 && (
                            <text x={x + 14} y={130 - barH - 5} textAnchor="middle" fontSize={9} fontWeight="700" fill={barColor}>{count}</text>
                          )}
                          <text x={x + 14} y={148} textAnchor="middle" fontSize={8} fill="#94a3b8">
                            {rangeStart}{rangeStart !== rangeEnd ? `–${rangeEnd}` : ''}
                          </text>
                        </g>
                      )
                    })}
                    {/* Linha de média */}
                    {(() => {
                      const xMedia = 24 + (mediaScore / binSize) * 36 + 14
                      return (
                        <g>
                          <line x1={xMedia} x2={xMedia} y1={20} y2={130} stroke="#f97316" strokeWidth={1.5} strokeDasharray="4,3" />
                          <text x={xMedia + 4} y={26} fontSize={8} fill="#f97316" fontWeight="700">média</text>
                        </g>
                      )
                    })()}
                  </svg>

                  {/* Legenda de cores */}
                  <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
                    {[
                      { label: `≥ ${Math.round(prova.num_questoes * 0.6)} (≥60%)`, cor: '#16a34a' },
                      { label: `${Math.round(prova.num_questoes * 0.4)}–${Math.round(prova.num_questoes * 0.6) - 1} (40–59%)`, cor: '#d97706' },
                      { label: `< ${Math.round(prova.num_questoes * 0.4)} (<40%)`, cor: '#dc2626' },
                    ].map(l => (
                      <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#64748b' }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: l.cor, display: 'inline-block', flexShrink: 0 }} />
                        {l.label}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Lista de pontuações individuais */}
                <div style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a', marginBottom: 14 }}>Pontuações individuais</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {corrigidas.map((entry, idx) => {
                      const pct = entry.pct || 0
                      return (
                        <div key={entry.aluno_id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', minWidth: 20, textAlign: 'right' }}>{idx + 1}</div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a', minWidth: 150, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.nome}</div>
                          <div style={{ flex: 2, height: 10, background: '#f1f5f9', borderRadius: 5, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: diffColor(pct), borderRadius: 5, transition: 'width 0.4s' }} />
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: diffColor(pct), minWidth: 52, textAlign: 'right' }}>
                            {prova.modelo === 'multipla_escolha' ? entry.pontos : entry.pontos?.toFixed(1)}
                            <span style={{ fontSize: 10, fontWeight: 500, color: '#94a3b8', marginLeft: 2 }}>({pct}%)</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          )}

        </div>
      )}
      <Nav />
    </div>
  )
}
