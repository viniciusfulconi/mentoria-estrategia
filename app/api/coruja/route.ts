import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { verifyAuth, requirePapel } from '@/lib/auth-server'

// A Coruja pode encadear várias consultas (loop agêntico) + raciocínio do Opus.
export const maxDuration = 60

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const anthropic = new Anthropic() // lê ANTHROPIC_API_KEY do ambiente

// Defesa em profundidade: a RPC coruja_query também valida, mas conferimos aqui
// antes de executar (denylist + só SELECT/WITH, statement único).
const SQL_FORBIDDEN = /\b(insert|update|delete|drop|truncate|alter|create|grant|revoke|comment|copy|vacuum|reindex|cluster|do|call|merge|listen|notify)\b|\bset\s/i
function sqlIsSafeSelect(sql: string): boolean {
  const trimmed = sql.trim().replace(/;+\s*$/, '')
  if (!trimmed) return false
  if (trimmed.includes(';')) return false
  if (!/^(select|with)\b/i.test(trimmed)) return false
  if (SQL_FORBIDDEN.test(trimmed)) return false
  return true
}

const SCHEMA = `
Tabelas disponíveis (PostgreSQL):

1. resultados — notas dos simulados; cada linha é um aluno + ciclo + fase.
   - id_aluno text, nome_aluno text, mentor text
   - ciclo_nome text  (ex: 'Ciclo 1' … 'Ciclo 6' — o número indica a ordem cronológica)
   - concurso text    ('ITA' ou 'IME')
   - fase text — valores e colunas preenchidas por fase:
       * '1fase'      → media_1fase (nota da 1ª fase)
       * '2fase_mat'  → nota_matematica
       * '2fase_fis'  → nota_fisica
       * '2fase_qui'  → nota_quimica
       * '2fase_port' → media_linguagens, nota_ingles
       * 'ranking'    → linha CONSOLIDADA do ciclo: media_1fase, media_2fase, resultado_ciclo
   - media_1fase, nota_matematica, nota_fisica, nota_quimica, media_linguagens, nota_ingles, media_2fase (numeric)
   - resultado_ciclo text ('Aprovado' | 'Reprovado' | 'Em andamento') — só em fase='ranking'

2. atendimentos_mentoria — aluno text, mentor text, data_atendimento date, duracao_minutos int, valor_pago numeric, resumo text, encaminhamento_psico bool
3. alunos_dados — id_aluno text, nome text, mentor text, turma text, email text, ingresso text ('PEC' = online)
4. respostas_csat — avaliações dos mentores (qualidade_atendimento, organizacao_planejamento, diferencial_mentoria, clareza_orientacoes, acompanhamento_cobranca, comunicacao_relacao — cada 1-5), mentor text
5. perfis — mentores/usuários: nome, mentor_nome, papel, email
`

// ── Semântica de trajetória e critério de aprovação (para as previsões) ─────────
const REGRAS = `
Trajetória e previsões:
- Para EVOLUÇÃO de um aluno ao longo do tempo, use fase='ranking' (uma linha por ciclo)
  e ordene pelos ciclos (extraia o número de ciclo_nome). media_2fase é a média final
  consolidada do ciclo (para ITA já inclui a 1ª fase); quando media_2fase é NULL (ciclo
  em andamento), use media_1fase como aproximação.
- "Melhorando" = média final subindo entre ciclos consecutivos (tendência positiva).
- Critério oficial de aprovação no ciclo (já refletido em resultado_ciclo):
    ITA: todas as 5 fases presentes (1ª fase, mat, fís, quí, português) E nenhuma das 4
         (mat/fís/quí/port) < 4,0 E media_2fase ≥ 5,0.
    IME: todas as 4 (mat, fís, quí, port) presentes E nenhuma < 4,0.
- "Forte candidato à aprovação" = tendência de média subindo, médias recentes altas
  (≥ 5,0, idealmente ≥ 6,0), poucas/nenhuma nota < 4,0, e resultado_ciclo recente
  'Aprovado' ou perto do corte.

Como responder previsões:
- Busque os dados de trajetória com a ferramenta (pode consultar quantas vezes precisar:
  primeiro descubra os candidatos, depois detalhe a trajetória de cada um).
- Baseie-se SEMPRE nos números retornados; não invente. Explique o racional (quais ciclos,
  quais médias, qual tendência) de forma curta.
- Deixe claro que é uma ESTIMATIVA baseada na tendência dos dados, não uma garantia.
- Responda em português, direto e organizado (listas quando fizer sentido).
`

const SYSTEM = `Você é a Coruja, analista de dados da plataforma de mentoria para os vestibulares ITA e IME. Você responde perguntas e faz análises preditivas sobre alunos, notas, atendimentos e avaliações, sempre a partir dos dados reais do banco — que você consulta com a ferramenta consultar_banco.

${SCHEMA}
${REGRAS}

Regras de SQL:
- Use SOMENTE SELECT (nunca INSERT/UPDATE/DELETE/DDL). A ferramenta rejeita o resto.
- Sempre LIMIT 100 no máximo.
- Médias: ROUND(AVG(campo)::numeric, 2). Nomes: ILIKE '%...%' (case-insensitive).
- Para dados de um aluno específico, use a tabela resultados com nome_aluno ILIKE '%nome%'
  (sem JOINs — grafias divergentes entre tabelas podem zerar o resultado).
- Se uma consulta voltar vazia por nome, tente de novo com menos partes do nome.
- Só use a ferramenta quando precisar de dados. Para perguntas gerais (ex.: "o que é o ITA?")
  responda direto, sem consultar.`

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'consultar_banco',
    description: 'Executa uma consulta SQL SELECT (somente leitura) no banco de dados e retorna as linhas em JSON. Use quantas vezes precisar para reunir os dados necessários à resposta.',
    input_schema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'A query SQL. Apenas SELECT/WITH, um único statement, com LIMIT 100 no máximo.' },
      },
      required: ['sql'],
      additionalProperties: false,
    },
  },
]

async function executarQuery(sql: string): Promise<{ rows: any[]; erro?: string }> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/coruja_query`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql_text: sql }),
  })
  if (!resp.ok) return { rows: [], erro: await resp.text() }
  const data = await resp.json()
  return { rows: Array.isArray(data) ? data : [] }
}

function truncarHistorico(historico: any[], max = 6) {
  return historico.slice(-max)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const auth = await verifyAuth(req, body)
    if ('error' in auth) return auth.error
    const { user } = auth

    // Coruja roda com service_role (bypass de RLS) — só gestão acessa.
    const perm = requirePapel(user, ['coordenador', 'direcao'])
    if (perm) return perm

    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY não configurada.' }, { status: 500 })
    if (!SERVICE_ROLE_KEY) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY não configurada.' }, { status: 500 })

    const { pergunta } = body
    const historico = truncarHistorico(body.historico || [])

    const messages: Anthropic.MessageParam[] = [
      ...historico.map((m: any) => ({ role: m.role, content: m.content })),
      { role: 'user', content: pergunta },
    ]

    const sqlsExecutadas: string[] = []
    let totalLinhas = 0
    let resposta = ''

    // Loop agêntico: o Opus consulta o banco quantas vezes precisar e então responde.
    for (let iter = 0; iter < 5; iter++) {
      const resp = await anthropic.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 8000, // folga p/ thinking adaptativo + resposta (abaixo do limiar que exige streaming)
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        tools: TOOLS,
        messages,
      })

      if (resp.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content: resp.content })
        const toolResults: Anthropic.ToolResultBlockParam[] = []
        for (const block of resp.content) {
          if (block.type === 'tool_use' && block.name === 'consultar_banco') {
            const sql = String((block.input as any)?.sql ?? '')
            sqlsExecutadas.push(sql)
            let content: string
            let isError = false
            if (!sqlIsSafeSelect(sql)) {
              content = 'Query rejeitada por segurança (apenas SELECT é permitido).'
              isError = true
            } else {
              const { rows, erro } = await executarQuery(sql)
              if (erro) { content = `Erro ao executar: ${erro}`; isError = true }
              else {
                totalLinhas += rows.length
                // Trunca payloads grandes para não estourar o contexto.
                content = JSON.stringify(rows).slice(0, 24000)
              }
            }
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content, is_error: isError })
          }
        }
        messages.push({ role: 'user', content: toolResults })
        continue
      }

      // stop_reason: end_turn (ou refusal / max_tokens) — extrai o texto final.
      resposta = resp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('\n').trim()
      break
    }

    return NextResponse.json({
      resposta: resposta || 'Não consegui concluir a análise. Tente reformular a pergunta.',
      sql: sqlsExecutadas.length ? sqlsExecutadas.join(';\n\n') : null,
      linhas: totalLinhas,
    })
  } catch (e: any) {
    console.error('[coruja] erro inesperado:', e)
    return NextResponse.json({ error: `Erro interno: ${e?.message ?? 'desconhecido'}` }, { status: 500 })
  }
}
