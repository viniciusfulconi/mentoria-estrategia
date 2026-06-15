export type Difficulty = 'Fácil' | 'Médio' | 'Difícil'
export type QuestionType = 'multiple_choice' | 'discursive'
export type ProgressStatus = 'not_seen' | 'in_review' | 'solved'

export type Alternative = {
  letter: string
  text: string
}

export type ArvoreMateria = {
  id: string
  nome: string
  vertical: 'ITA' | 'Medicina' | null
  ordem: number
}

export type ArvoreTopico = {
  id: string
  materia_id: string
  nome: string
  ordem: number
}

export type ArvoreSubtopico = {
  id: string
  topico_id: string
  nome: string
  ordem: number
}

export type Question = {
  id: string
  statement: string
  alternatives: Alternative[] | null
  answer: string | null
  solution: string | null
  subject: string
  topic: string | null
  subtopic: string | null
  subtopico_id: string | null
  source: string | null
  year: number | null
  difficulty: Difficulty | null
  type: QuestionType
  tags: string[] | null
  vertical: 'ITA' | 'Medicina' | null
  created_by: string | null
  created_at: string
}

export type QuestaoProgresso = {
  id: string
  aluno_id: string
  question_id: string
  status: ProgressStatus
  notes: string | null
  updated_at: string
}

export type Desafio = {
  id: string
  titulo: string
  enunciado: string | null
  question_id: string | null
  materia: string | null
  recompensa: number
  dificuldade: Difficulty | null
  inicio: string
  fim: string
  vertical: 'ITA' | 'Medicina' | null
  criado_por: string | null
  created_at: string
}

export type DesafioResposta = {
  id: string
  desafio_id: string
  aluno_id: string
  resposta: string
  validado: boolean | null
  penas_pagas: boolean
  criado_em: string
}

export const SUBJECTS = [
  'Física', 'Matemática', 'Química', 'Biologia',
  'História', 'Geografia', 'Português', 'Inglês', 'Redação',
] as const

export const DIFFICULTIES: Difficulty[] = ['Fácil', 'Médio', 'Difícil']

export const SOURCES = [
  'ITA', 'IME', 'AFA', 'EsPCEx', 'EFOMM', 'EEAR',
  'FUVEST', 'UNICAMP', 'ENEM', 'Inédita',
] as const

export function difficultyColor(d: Difficulty | null | undefined) {
  if (d === 'Fácil') return '#16a34a'
  if (d === 'Médio') return '#d97706'
  if (d === 'Difícil') return '#dc2626'
  return '#64748b'
}

export function difficultyBg(d: Difficulty | null | undefined) {
  if (d === 'Fácil') return '#dcfce7'
  if (d === 'Médio') return '#fef9c3'
  if (d === 'Difícil') return '#fee2e2'
  return '#f1f5f9'
}

export function statusLabel(s: ProgressStatus) {
  if (s === 'solved') return 'Resolvida'
  if (s === 'in_review') return 'Revisando'
  return 'Não vista'
}
