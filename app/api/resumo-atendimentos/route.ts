import { NextRequest, NextResponse } from 'next/server'
import mammoth from 'mammoth'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!

async function querySupabase(table: string, select: string, params: Record<string, string>, token: string) {
  const qs = new URLSearchParams({ select, ...params }).toString()
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  })
  if (!resp.ok) throw new Error(await resp.text())
  return resp.json() as Promise<any[]>
}

async function extrairTextoDocx(url: string): Promise<string> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!resp.ok) return ''
    const buffer = await resp.arrayBuffer()
    const { value } = await mammoth.extractRawText({ arrayBuffer: buffer })
    return value.trim()
  } catch {
    return ''
  }
}

export async function POST(req: NextRequest) {
  const { escopo, mentor, token } = await req.json()

  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY não configurada no servidor.' }, { status: 500 })

  // ── 1. Busca alunos do mentor para encontrar os históricos ──────────────────
  const alunosParams: Record<string, string> = { order: 'nome' }
  if (mentor && mentor !== 'todos') alunosParams.mentor = `eq.${mentor}`

  let alunos: any[] = []
  try {
    alunos = await querySupabase('alunos_dados', 'id_aluno,nome,mentor', alunosParams, token)
  } catch (e: any) {
    return NextResponse.json({ error: `Erro ao buscar alunos: ${e.message}` }, { status: 500 })
  }

  // ── 2. Tenta buscar o histórico consolidado de cada aluno ───────────────────
  const historicos: string[] = []
  await Promise.all(
    alunos.map(async aluno => {
      const url = `${SUPABASE_URL}/storage/v1/object/public/historico-alunos/${aluno.id_aluno}.docx`
      const texto = await extrairTextoDocx(url)
      if (texto) {
        historicos.push(`=== Histórico completo de atendimentos — ${aluno.nome} ===\n${texto}`)
      }
    })
  )

  // ── 3. Busca atendimentos recentes com .docx uploadado individualmente ──────
  const atParams: Record<string, string> = {
    arquivo_gemini_url: 'not.is.null',
    order: 'data_atendimento.desc',
  }
  if (mentor && mentor !== 'todos') atParams.mentor = `eq.${mentor}`
  if (escopo === 'ultimo') {
    atParams.limit = '1'
  } else if (escopo === 'mes') {
    const hoje = new Date()
    const inicio = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`
    atParams.data_atendimento = `gte.${inicio}`
  }

  let atendimentos: any[] = []
  try {
    atendimentos = await querySupabase('atendimentos_mentoria', '*', atParams, token)
  } catch {
    // Não bloqueia se falhar — históricos podem ser suficientes
  }

  const recentesTextos: string[] = []
  if (atendimentos.length) {
    const lote = atendimentos.slice(0, 20)
    const extraidos = await Promise.all(
      lote.map(async at => {
        const texto = await extrairTextoDocx(at.arquivo_gemini_url)
        if (!texto) return null
        const data = at.data_atendimento
          ? new Date(at.data_atendimento).toLocaleDateString('pt-BR')
          : '?'
        return `--- Sessão individual: ${at.aluno || 'Coletivo'} com ${at.mentor} em ${data} ---\n${texto}`
      })
    )
    recentesTextos.push(...(extraidos.filter(Boolean) as string[]))
  }

  // ── 4. Valida se há algum conteúdo ─────────────────────────────────────────
  if (!historicos.length && !recentesTextos.length) {
    const temAlunos = alunos.length > 0
    const msg = temAlunos
      ? 'Nenhum arquivo de histórico encontrado no bucket "historico-alunos" para os alunos deste mentor, e nenhum atendimento com .docx individual.'
      : 'Nenhum aluno encontrado para este mentor.'
    return NextResponse.json({ error: msg }, { status: 404 })
  }

  // ── 5. Monta prompt ─────────────────────────────────────────────────────────
  const mentorLabel = mentor && mentor !== 'todos' ? `do mentor ${mentor}` : 'de todos os mentores'
  const escopoLabel =
    escopo === 'ultimo' ? 'último atendimento' :
    escopo === 'mes'    ? 'último mês' : 'todos os atendimentos'

  const partes: string[] = []
  if (historicos.length) {
    partes.push(
      `## HISTÓRICO CONSOLIDADO POR ALUNO (${historicos.length} aluno${historicos.length !== 1 ? 's' : ''})\n\n` +
      historicos.join('\n\n')
    )
  }
  if (recentesTextos.length) {
    partes.push(
      `## SESSÕES RECENTES (${escopoLabel})\n\n` +
      recentesTextos.join('\n\n')
    )
  }

  const prompt = `Você é um assistente especializado em análise de sessões de mentoria para estudantes que se preparam para os vestibulares ITA e IME.

Abaixo estão os relatórios ${mentorLabel}. Com base nesses relatórios, gere um resumo estruturado em markdown. Para cada seção, seja específico e cite exemplos concretos dos relatos quando possível. Se não houver informação suficiente para uma seção, escreva "Não identificado nos relatórios."

## 1. Principais dúvidas dos alunos nos atendimentos
Dúvidas conceituais, de resolução ou de interpretação trazidas pelos alunos durante as sessões.

## 2. Pontos fracos por matéria
Matérias ou tópicos específicos onde o aluno demonstra maior dificuldade.

## 3. Pontos fortes por matéria
Matérias ou tópicos onde o aluno se destaca ou tem melhor desempenho.

## 4. Dúvidas no processo de estudo
Dúvidas sobre como estudar, que material usar, como organizar a rotina ou como abordar determinados conteúdos.

## 5. Dificuldades para estudar ou se concentrar
Relatos de procrastinação, dificuldade de foco, cansaço, falta de motivação ou outros obstáculos práticos ao estudo.

## 6. Pontos fortes identificados pelo mentor
Qualidades, habilidades e características positivas que o mentor observou no aluno ao longo dos atendimentos.

## 7. Pontos fracos identificados pelo mentor
Comportamentos, hábitos ou características que o mentor identificou como limitadores do desenvolvimento do aluno.

## 8. Possíveis fontes de ansiedade
Situações, pensamentos ou contextos que parecem gerar ansiedade ou pressão excessiva no aluno.

## 9. Pontos fracos nos simulados
Padrões de erro, matérias com pior desempenho ou comportamentos problemáticos identificados nos resultados de simulados.

## 10. Outros pontos relevantes
Qualquer outro aspecto significativo mencionado nos relatórios que não se encaixe nas seções anteriores mas que mereça atenção da coordenação ou do mentor.

---

Use linguagem direta e profissional. Não repita informações entre seções. Cite o nome do aluno quando a informação for específica de um indivíduo.

${partes.join('\n\n---\n\n')}`

  // ── 6. Chama Claude ─────────────────────────────────────────────────────────
  const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(60000),
  })

  if (!claudeResp.ok) {
    const err = await claudeResp.text()
    return NextResponse.json({ error: `Erro na IA: ${err}` }, { status: 500 })
  }

  const claudeData = await claudeResp.json()
  const resumo = claudeData.content?.[0]?.text ?? 'Sem resposta da IA.'

  return NextResponse.json({
    resumo,
    meta: {
      historicos: historicos.length,
      recentes: recentesTextos.length,
      escopo,
      mentor: mentor || 'todos',
    },
  })
}
