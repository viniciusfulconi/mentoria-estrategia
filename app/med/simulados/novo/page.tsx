'use client'
import { useEffect, useState } from 'react'
import { dbQuery, dbInsert } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Nav from '@/components/Nav'

type Template = { id: string; nome: string; fases: any[]; tipo?: string }

export default function NovoSimulado() {
  const router = useRouter()
  const { perfil } = useAuth()
  const [templates, setTemplates] = useState<Template[]>([])
  const [turmas, setTurmas] = useState<any[]>([])
  const [templateId, setTemplateId] = useState('')
  const [nome, setNome] = useState('')
  const [turmaId, setTurmaId] = useState('')
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (perfil && perfil.papel !== 'coordenador' && perfil.papel !== 'direcao') { router.replace('/'); return }
    Promise.all([
      dbQuery<Template>('simulado_templates', { vertical: 'eq.Medicina', order: 'nome' }),
      dbQuery('turmas', { tipo: 'eq.Medicina', order: 'nome' }),
    ]).then(([{ data: t }, { data: tu }]) => {
      setTemplates(t || [])
      setTurmas(tu || [])
    })
  }, [perfil])

  function gerarQuestoesENEM(simuladoId: string): any[] {
    const row = (fase: number, dia: number, numero: number, materia: string, tipo: string, alternativas: string | null, pontuacao_max: number, grupo: string | null): any => ({
      simulado_id: simuladoId, fase, dia, numero, materia, tipo, alternativas, pontuacao_max, grupo,
    })
    const o = (fase: number, dia: number, numero: number, materia: string, grupo: string | null = null): any =>
      row(fase, dia, numero, materia, 'objetiva', 'A-E', 1, grupo)

    // Mapeamento real por questão (Q1-Q180)
    const materias: Record<number, string> = {
      1:'Inglês',2:'Inglês',3:'Inglês',4:'Inglês',5:'Inglês',
      6:'Literatura',7:'Língua Portuguesa',8:'Literatura',9:'Língua Portuguesa',
      10:'Língua Portuguesa',11:'Língua Portuguesa',12:'Artes',13:'Língua Portuguesa',
      14:'Língua Portuguesa',15:'Língua Portuguesa',16:'Literatura',17:'Língua Portuguesa',
      18:'Artes',19:'Língua Portuguesa',20:'Língua Portuguesa',21:'Literatura',
      22:'Língua Portuguesa',23:'Artes',24:'Literatura',25:'Literatura',
      26:'Literatura',27:'Literatura',28:'Língua Portuguesa',29:'Artes',
      30:'Língua Portuguesa',31:'Literatura',32:'Língua Portuguesa',33:'Literatura',
      34:'Educação Física',35:'Língua Portuguesa',36:'Literatura',37:'Língua Portuguesa',
      38:'Artes',39:'Língua Portuguesa',40:'Literatura',41:'Língua Portuguesa',
      42:'Literatura',43:'Língua Portuguesa',44:'Literatura',45:'Língua Portuguesa',
      46:'História',47:'Filosofia',48:'Geografia',49:'História',50:'Sociologia',
      51:'Geografia',52:'História',53:'Geografia',54:'Sociologia',55:'Sociologia',
      56:'Geografia',57:'Filosofia',58:'História',59:'História',60:'Geografia',
      61:'História',62:'Filosofia',63:'Geografia',64:'Sociologia',65:'Filosofia',
      66:'História',67:'Geografia',68:'Sociologia',69:'História',70:'História',
      71:'Geografia',72:'Filosofia',73:'História',74:'História',75:'Sociologia',
      76:'História',77:'Geografia',78:'Filosofia',79:'História',80:'Geografia',
      81:'História',82:'Geografia',83:'Sociologia',84:'Sociologia',85:'Geografia',
      86:'Geografia',87:'História',88:'Geografia',89:'Filosofia',90:'Geografia',
      91:'Física',92:'Física',93:'Biologia',94:'Física',95:'Química',
      96:'Química',97:'Física',98:'Biologia',99:'Química',100:'Física',
      101:'Biologia',102:'Física',103:'Química',104:'Química',105:'Biologia',
      106:'Física',107:'Biologia',108:'Física',109:'Química',110:'Biologia',
      111:'Física',112:'Biologia',113:'Biologia',114:'Física',115:'Biologia',
      116:'Química',117:'Física',118:'Química',119:'Física',120:'Biologia',
      121:'Química',122:'Biologia',123:'Física',124:'Biologia',125:'Física',
      126:'Biologia',127:'Química',128:'Física',129:'Química',130:'Biologia',
      131:'Química',132:'Biologia',133:'Química',134:'Química',135:'Química',
      136:'Matemática',137:'Matemática',138:'Matemática',139:'Matemática',140:'Matemática',
      141:'Matemática',142:'Matemática',143:'Matemática',144:'Matemática',145:'Matemática',
      146:'Matemática',147:'Matemática',148:'Matemática',149:'Matemática',150:'Matemática',
      151:'Matemática',152:'Matemática',153:'Matemática',154:'Matemática',155:'Matemática',
      156:'Matemática',157:'Matemática',158:'Matemática',159:'Matemática',160:'Matemática',
      161:'Matemática',162:'Matemática',163:'Matemática',164:'Matemática',165:'Matemática',
      166:'Matemática',167:'Matemática',168:'Matemática',169:'Matemática',170:'Matemática',
      171:'Matemática',172:'Matemática',173:'Matemática',174:'Matemática',175:'Matemática',
      176:'Matemática',177:'Matemática',178:'Matemática',179:'Matemática',180:'Matemática',
    }

    const qs: any[] = []

    // ── Dia 1 (Q1-Q90): LC + CH ──────────────────────────────
    for (let n = 1; n <= 90; n++) {
      if (n <= 5) {
        qs.push(o(1, 1, n, 'Inglês', 'ingles'))
        qs.push(o(1, 1, n, 'Espanhol', 'espanhol'))
      } else {
        qs.push(o(1, 1, n, materias[n]))
      }
    }

    // ── Dia 2 (Q91-Q180): CN + MT ────────────────────────────
    for (let n = 91; n <= 180; n++) qs.push(o(1, 2, n, materias[n]))

    // ── Fase 2: Redação ──────────────────────────────────────
    qs.push(row(2, 1, 1, 'Redação', 'dissertativa', null, 1000, null))

    return qs
  }

  async function criar() {
    if (!templateId) { setErro('Selecione um modelo de prova.'); return }
    if (!nome.trim()) { setErro('Informe o nome do simulado.'); return }

    setSaving(true); setErro('')

    const { data: simData, error: simErr } = await dbInsert('simulados_med', [{
      template_id: templateId,
      nome: nome.trim(),
      vertical: 'Medicina',
      turma_id: turmaId || null,
      status: 'criado',
    }], true)

    if (simErr || !simData || simData.length === 0) {
      setErro(simErr || 'Erro ao criar simulado.'); setSaving(false); return
    }
    const simuladoId = simData[0].id

    const template = templates.find(t => t.id === templateId)!
    const questoes: any[] = template.tipo === 'enem'
      ? gerarQuestoesENEM(simuladoId)
      : (() => {
          const qs: any[] = []
          ;(template.fases || []).forEach((fase: any, fi: number) => {
            ;(fase.dias || []).forEach((dia: any, di: number) => {
              ;(dia.materias || []).forEach((mat: any) => {
                if (!mat.qtd_questoes || mat.qtd_questoes === 0) return
                for (let q = 1; q <= mat.qtd_questoes; q++) {
                  const numero = mat.q_inicio ? mat.q_inicio + (q - 1) : q
                  qs.push({
                    simulado_id: simuladoId,
                    fase: fi + 1, dia: di + 1, numero,
                    materia: mat.materia, tipo: 'objetiva',
                    alternativas: 'A-E', pontuacao_max: mat.peso || 1,
                  })
                }
              })
            })
          })
          return qs
        })()

    if (questoes.length > 0) {
      const { error: qErr } = await dbInsert('simulado_questoes', questoes)
      if (qErr) { setErro(qErr); setSaving(false); return }
    }

    router.push(`/med/simulados/${simuladoId}`)
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    border: '1px solid rgba(0,0,0,0.12)', fontSize: 14,
    background: 'white', outline: 'none', boxSizing: 'border-box',
    fontFamily: 'DM Sans, sans-serif', color: '#1a1a1a',
  }

  const templateSel = templates.find(t => t.id === templateId)
  const totalQuestoes = templateSel
    ? templateSel.tipo === 'enem'
      ? 180
      : (templateSel.fases || []).reduce((acc: number, f: any) =>
          acc + (f.dias || []).reduce((a: number, d: any) =>
            a + (d.materias || []).reduce((b: number, m: any) => b + (m.qtd_questoes || 0), 0), 0), 0)
    : 0

  return (
    <div style={{ paddingBottom: 80 }}>
      <Nav />

      <div style={{
        background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)',
        padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa' }}>←</button>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Novo simulado</div>
          <div style={{ fontSize: 11, color: '#999' }}>Medicina</div>
        </div>
      </div>

      <div style={{ padding: '20px 16px', maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {erro && <div style={{ background: '#FEF2F2', color: '#991B1B', fontSize: 13, padding: '10px 14px', borderRadius: 10 }}>{erro}</div>}

        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#666', display: 'block', marginBottom: 6 }}>
            Modelo de prova <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <select style={inp} value={templateId} onChange={e => setTemplateId(e.target.value)}>
            <option value="">Selecionar modelo...</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
          {templateSel && (
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              {templateSel.tipo === 'enem'
                ? `ENEM · Dia 1: LC+CH (90 Q, bilíngue) · Dia 2: CN+MT (90 Q) · Redação`
                : `${(templateSel.fases || []).length} fase${(templateSel.fases || []).length !== 1 ? 's' : ''} · ${totalQuestoes} questões serão geradas`
              }
            </div>
          )}
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#666', display: 'block', marginBottom: 6 }}>
            Nome do simulado <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input style={inp} value={nome} onChange={e => setNome(e.target.value)}
            placeholder="Ex: Simulado FUVEST 1 — Turma 2025" />
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#666', display: 'block', marginBottom: 6 }}>Turma (opcional)</label>
          <select style={inp} value={turmaId} onChange={e => setTurmaId(e.target.value)}>
            <option value="">Todas as turmas</option>
            {turmas.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </div>

        {templates.length === 0 && !saving && (
          <div style={{ background: '#FEF9C3', color: '#854d0e', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
            Nenhum modelo de prova criado ainda.{' '}
            <a href="/med/simulados/templates/novo" style={{ color: 'var(--purple)', fontWeight: 600 }}>Criar modelo</a>
          </div>
        )}

        <button
          onClick={criar} disabled={saving || templates.length === 0}
          style={{
            padding: 14, borderRadius: 12, border: 'none',
            background: saving || templates.length === 0 ? '#ccc' : 'var(--purple)',
            color: 'white', fontSize: 15, fontWeight: 600,
            cursor: saving || templates.length === 0 ? 'not-allowed' : 'pointer',
            fontFamily: 'DM Sans, sans-serif', marginTop: 4,
          }}
        >
          {saving ? 'Criando...' : 'Criar simulado'}
        </button>
      </div>
    </div>
  )
}
