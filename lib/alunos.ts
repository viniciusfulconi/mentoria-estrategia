import { dbQuery } from './supabase'

export type AlunoBasico = { id: string; nome: string }

type PerfilLike = {
  papel?: string
  nome?: string
  mentor_nome?: string
} | null | undefined

/**
 * Carrega os alunos visíveis para o perfil, na vertical dada, já normalizados
 * em { id, nome }.
 *
 * As duas verticais guardam aluno em tabelas diferentes: o ITA usa
 * `alunos_dados` (id_aluno, mentor por nome) e Medicina usa `alunos`
 * (id, mentor_id apontando para `mentores`). Quem consome tarefas, mapas de
 * revisão etc. não deveria precisar saber disso.
 */
export async function carregarAlunos(
  vertical: 'ITA' | 'Medicina',
  perfil: PerfilLike,
): Promise<AlunoBasico[]> {
  const isMentor = perfil?.papel === 'mentor'

  if (vertical === 'Medicina') {
    const params: Record<string, string> = { vertical: 'eq.Medicina', order: 'nome' }
    if (isMentor) {
      const nomeRef = perfil?.mentor_nome || perfil?.nome || ''
      const { data: m } = await dbQuery('mentores', { nome: `eq.${nomeRef}` }, 'id')
      const mentorId = m?.[0]?.id
      if (!mentorId) return []
      params.mentor_id = `eq.${mentorId}`
    }
    const { data } = await dbQuery('alunos', params, 'id,nome')
    return (data || []).map((a: any) => ({ id: a.id, nome: a.nome }))
  }

  const params: Record<string, string> = { order: 'nome' }
  if (isMentor) params.mentor = `eq.${perfil?.mentor_nome || ''}`
  const { data } = await dbQuery('alunos_dados', params, 'id_aluno,nome')
  return (data || []).map((a: any) => ({ id: a.id_aluno, nome: a.nome }))
}

/** Matérias disponíveis para tarefas/mapas na vertical. */
export async function carregarMaterias(vertical: 'ITA' | 'Medicina'): Promise<string[]> {
  if (vertical === 'Medicina') {
    const { data } = await dbQuery('arvore_materias', { vertical: 'eq.Medicina', order: 'ordem.asc' }, 'nome')
    return (data || []).map((m: any) => m.nome)
  }
  const { data } = await dbQuery('topicos', {}, 'materia')
  return [...new Set((data || []).map((x: any) => x.materia))].sort() as string[]
}
