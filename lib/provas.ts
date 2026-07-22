// ─────────────────────────────────────────────────────────────────────────────
// Helpers de Provas Antigas compartilhados entre a tela do ALUNO
// (/minhas-provas/[id]) e a tela de COMENTÁRIO do mentor
// (/provas-antigas/[id]/comentar/[provaAlunoId]).
//
// Existem para as duas telas nunca divergirem no critério de "questão fraca":
// o mentor comenta exatamente as questões que o aluno vê marcadas para revisar.
// ─────────────────────────────────────────────────────────────────────────────

export type TopicoDB = { id: string; materia?: string; topico: string }

export type QuestaoProva = {
  numero: number
  materia: string
  topicos?: string[] | null
}

export type QuestaoFraca = {
  numero: number
  materia: string
  nota: number
  topicos: string[]
}

// Nota abaixo da qual a questão entra na lista de revisão. Prova discursiva é
// pontuada de 0 a 1 por questão (ver PROVAS_ANTIGAS_MIGRATION.sql).
export const LIMITE_QUESTAO_FRACA = 0.7

// uuid[] de questoes_prova_antiga.topicos → nomes legíveis.
// Tópico que não existe mais em `topicos` é descartado silenciosamente: a prova
// pode ter sido cadastrada antes de alguém reorganizar a lista.
export function resolverTopicos(ids: string[] | null | undefined, topicosDB: TopicoDB[]): string[] {
  if (!ids?.length) return []
  return ids
    .map(id => topicosDB.find(t => t.id === id)?.topico)
    .filter(Boolean) as string[]
}

// Questões de uma prova discursiva em que o aluno ficou abaixo do limite.
//
// Questão SEM nota lançada fica de fora — o `?? 1` trata ausência como acerto
// de propósito: uma correção incompleta não deve encher a lista de revisão com
// questões que ninguém avaliou. É o mesmo comportamento que a tela do aluno já
// tinha antes desta extração.
export function questoesFracas(
  notas: Record<string, number> | null | undefined,
  questoes: QuestaoProva[],
  topicosDB: TopicoDB[] = [],
): QuestaoFraca[] {
  const n = notas || {}
  return questoes
    .filter(q => Number(n[String(q.numero)] ?? 1) < LIMITE_QUESTAO_FRACA)
    .map(q => ({
      numero: q.numero,
      materia: q.materia,
      nota: Number(n[String(q.numero)] ?? 0),
      topicos: resolverTopicos(q.topicos, topicosDB),
    }))
}

// Ids (não nomes) dos tópicos das questões fracas — é a pré-seleção que a tela
// de comentário oferece ao mentor. Únicos e na ordem das questões.
export function topicosSugeridos(
  notas: Record<string, number> | null | undefined,
  questoes: QuestaoProva[],
): string[] {
  const n = notas || {}
  const ids = questoes
    .filter(q => Number(n[String(q.numero)] ?? 1) < LIMITE_QUESTAO_FRACA)
    .flatMap(q => q.topicos || [])
  return [...new Set(ids)]
}
