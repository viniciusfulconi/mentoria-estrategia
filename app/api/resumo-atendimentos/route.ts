import { NextRequest, NextResponse } from 'next/server'
import mammoth from 'mammoth'
import { verifyAuth, requirePapel } from '@/lib/auth-server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!

type Tipo = 'geral' | 'ultimo' | 'ultimos_dois'

async function querySupabase(table: string, select: string, params: Record<string, string>, token: string) {
  const qs = new URLSearchParams({ select, ...params }).toString()
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  })
  if (!resp.ok) throw new Error(await resp.text())
  return resp.json() as Promise<any[]>
}

async function extrairTextoDocx(url: string): Promise<string> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!resp.ok) {
      console.error(`[docx] fetch falhou: ${resp.status} ${url}`)
      return ''
    }
    const arrayBuffer = await resp.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const { value, messages } = await mammoth.extractRawText({ buffer })
    if (messages?.length) console.warn(`[docx] mammoth warnings:`, messages)
    console.log(`[docx] extraído ${value.length} chars de ${url}`)
    return value.trim()
  } catch (e) {
    console.error(`[docx] erro ao extrair ${url}:`, e)
    return ''
  }
}

function promptPara(tipo: Tipo, alunoNome: string, partes: string[]): string {
  const contexto = partes.join('\n\n---\n\n')

  if (tipo === 'ultimo' || tipo === 'ultimos_dois') {
    const label = tipo === 'ultimo' ? 'último atendimento' : 'últimos dois atendimentos'
    return `Você é um assistente especializado em análise de sessões de mentoria para estudantes que se preparam para os vestibulares ITA e IME.

Abaixo está o relatório do ${label} do aluno ${alunoNome}. Faça uma análise objetiva e direta em markdown com os seguintes tópicos. Se algum item não estiver presente no relato, escreva "Não mencionado neste atendimento."

# Análise — ${alunoNome} (${label})

## Temas trabalhados
Assuntos, matérias ou questões discutidas na sessão.

## Dúvidas e dificuldades
Dúvidas conceituais, de método ou de conteúdo que o aluno trouxe.

## Encaminhamentos e combinados
O que foi acordado, recomendado ou ficou como tarefa para o aluno.

## Observações do mentor
Percepções sobre o estado emocional, motivação, foco ou evolução do aluno.

## Pontos de atenção
Qualquer sinal de alerta ou ponto que mereça acompanhamento próximo.

---

Use linguagem direta e profissional.

${contexto}`
  }

  // tipo === 'geral'
  return `Você é um assistente especializado em análise de sessões de mentoria para estudantes que se preparam para os vestibulares ITA e IME.

Abaixo estão os relatórios de todos os atendimentos do aluno ${alunoNome}. Com base nesses relatórios, gere uma análise individual detalhada em markdown. Para cada seção, seja específico e cite exemplos concretos dos relatos quando possível. Se não houver informação suficiente para uma seção, escreva "Não identificado nos relatórios."

# Análise de ${alunoNome}

## 1. Principais dúvidas nos atendimentos
Dúvidas conceituais, de resolução ou de interpretação trazidas pelo aluno durante as sessões.

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
Qualquer outro aspecto significativo mencionado nos relatórios que mereça atenção.

---

Use linguagem direta e profissional. Não repita informações entre seções.

${contexto}`
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { alunoId: string; alunoNome: string; token?: string; tipo?: Tipo }
  const auth = await verifyAuth(req, body)
  if ('error' in auth) return auth.error
  const { user } = auth

  // Só staff acessa resumos de outros alunos
  const perm = requirePapel(user, ['mentor', 'coordenador', 'direcao'])
  if (perm) return perm

  const { alunoId, alunoNome, tipo = 'geral' } = body
  const token = user.token

  if (!alunoId || !alunoNome) return NextResponse.json({ error: 'Aluno não informado.' }, { status: 400 })
  if (!ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY não configurada no servidor.' }, { status: 500 })

  const partes: string[] = []

  if (tipo === 'geral') {
    // ── Histórico consolidado ──────────────────────────────────────────────────
    const urlHistorico = `${SUPABASE_URL}/storage/v1/object/public/historico-alunos/${alunoId}.docx`
    const textoHistorico = await extrairTextoDocx(urlHistorico)
    if (textoHistorico) partes.push(`## HISTÓRICO COMPLETO DE ATENDIMENTOS\n\n${textoHistorico}`)

    // ── Sessões individuais ────────────────────────────────────────────────────
    try {
      const atendimentos = await querySupabase(
        'atendimentos_mentoria',
        'aluno,mentor,data_atendimento,arquivo_gemini_url',
        { aluno: `eq.${alunoNome}`, arquivo_gemini_url: 'not.is.null', order: 'data_atendimento.desc' },
        token
      )
      const extraidos = await Promise.all(
        atendimentos.slice(0, 20).map(async at => {
          const texto = await extrairTextoDocx(at.arquivo_gemini_url)
          if (!texto) return null
          const data = at.data_atendimento ? new Date(at.data_atendimento).toLocaleDateString('pt-BR') : '?'
          return `--- Sessão com ${at.mentor} em ${data} ---\n${texto}`
        })
      )
      const recentes = extraidos.filter(Boolean) as string[]
      if (recentes.length) partes.push(`## SESSÕES RECENTES\n\n${recentes.join('\n\n')}`)
    } catch { /* histórico pode ser suficiente */ }

  } else {
    // ── Último ou últimos dois atendimentos ────────────────────────────────────
    const limite = tipo === 'ultimo' ? 1 : 2
    try {
      const atendimentos = await querySupabase(
        'atendimentos_mentoria',
        'aluno,mentor,data_atendimento,arquivo_gemini_url',
        { aluno: `eq.${alunoNome}`, arquivo_gemini_url: 'not.is.null', order: 'data_atendimento.desc', limit: String(limite) },
        token
      )
      const extraidos = await Promise.all(
        atendimentos.map(async at => {
          const texto = await extrairTextoDocx(at.arquivo_gemini_url)
          if (!texto) return null
          const data = at.data_atendimento ? new Date(at.data_atendimento).toLocaleDateString('pt-BR') : '?'
          return `--- Sessão com ${at.mentor} em ${data} ---\n${texto}`
        })
      )
      const textos = extraidos.filter(Boolean) as string[]
      textos.forEach(t => partes.push(t))
    } catch { /* silencioso */ }
  }

  if (!partes.length) {
    const msg = tipo === 'geral'
      ? `Nenhum relatório encontrado para ${alunoNome}. Verifique se o arquivo ${alunoId}.docx foi enviado para o bucket "historico-alunos" no Supabase.`
      : `Nenhum atendimento com arquivo encontrado para ${alunoNome}. O mentor precisa fazer upload do .docx ao registrar o atendimento.`
    return NextResponse.json({ error: msg }, { status: 404 })
  }

  const prompt = promptPara(tipo, alunoNome, partes)

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

  return NextResponse.json({ resumo, meta: { aluno: alunoNome, tipo } })
}
