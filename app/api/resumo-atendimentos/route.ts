import { NextRequest, NextResponse } from 'next/server'
import mammoth from 'mammoth'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!

async function querySupabase(params: Record<string, string>, token: string) {
  const qs = new URLSearchParams({ select: '*', ...params }).toString()
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/atendimentos_mentoria?${qs}`, {
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

  const params: Record<string, string> = {
    arquivo_gemini_url: 'not.is.null',
    order: 'data_atendimento.desc',
  }
  if (mentor && mentor !== 'todos') params.mentor = `eq.${mentor}`
  if (escopo === 'ultimo') {
    params.limit = '1'
  } else if (escopo === 'mes') {
    const hoje = new Date()
    const inicio = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`
    params.data_atendimento = `gte.${inicio}`
  }

  let atendimentos: any[]
  try {
    atendimentos = await querySupabase(params, token)
  } catch (e: any) {
    return NextResponse.json({ error: `Erro ao buscar atendimentos: ${e.message}` }, { status: 500 })
  }

  if (!atendimentos.length) {
    return NextResponse.json({ error: 'Nenhum atendimento com relatório .docx encontrado para este filtro.' }, { status: 404 })
  }

  // Extrai texto de cada docx em paralelo (máx 20 arquivos por vez)
  const lote = atendimentos.slice(0, 20)
  const textos = await Promise.all(
    lote.map(async at => {
      const texto = await extrairTextoDocx(at.arquivo_gemini_url)
      if (!texto) return null
      const data = at.data_atendimento
        ? new Date(at.data_atendimento).toLocaleDateString('pt-BR')
        : '?'
      return `--- Atendimento: ${at.aluno || 'Coletivo'} com ${at.mentor} em ${data} ---\n${texto}`
    })
  )

  const textosValidos = textos.filter(Boolean) as string[]
  if (!textosValidos.length) {
    return NextResponse.json({ error: 'Não foi possível extrair texto de nenhum arquivo .docx.' }, { status: 422 })
  }

  const escopoLabel =
    escopo === 'ultimo' ? 'último atendimento' :
    escopo === 'mes'    ? 'último mês' :
                          'todos os atendimentos'
  const mentorLabel = mentor && mentor !== 'todos' ? `do mentor ${mentor}` : 'de todos os mentores'

  const prompt = `Você é um assistente especializado em análise de sessões de mentoria para estudantes que se preparam para os vestibulares ITA e IME.

Abaixo estão os relatórios do ${escopoLabel} ${mentorLabel} (${textosValidos.length} atendimento${textosValidos.length !== 1 ? 's' : ''}). Gere um resumo executivo em markdown para a coordenação com as seguintes seções:

## Visão geral
Quantos atendimentos, mentores, período coberto.

## Principais demandas dos alunos
O que os alunos mais trouxeram nas sessões.

## Pontos de atenção
Dificuldades recorrentes, sinais de risco emocional ou acadêmico.

## Destaques positivos
Evoluções, conquistas, bons momentos mencionados.

## Recomendações para a coordenação
Ações concretas com base nos relatos.

Use linguagem profissional e objetiva. Não repita informações redundantes entre seções.

---

${textosValidos.join('\n\n')}`

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
    meta: { total: textosValidos.length, escopo, mentor: mentor || 'todos' },
  })
}
