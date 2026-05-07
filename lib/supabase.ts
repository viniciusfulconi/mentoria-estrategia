import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Turma = {
  id: string
  nome: string
  tipo: 'ITA' | 'Medicina'
  ano: number
  orcamento_total: number
  created_at: string
}

export type Mentor = {
  id: string
  nome: string
  email: string
  turma_id: string
  materia: string
  valor_por_atendimento: number
  nota_media: number
  total_atendimentos: number
  created_at: string
  turma?: Turma
}

export type Aluno = {
  id: string
  nome: string
  email: string
  turma_id: string
  mentor_id: string | null
  created_at: string
  turma?: Turma
  mentor?: Mentor
}

export type Simulado = {
  id: string
  aluno_id: string
  turma_id: string
  titulo: string
  data: string
  nota: number
  materias: Record<string, number>
  created_at: string
  aluno?: Aluno
}

export type Aula = {
  id: string
  titulo: string
  turma_id: string | null
  materia: string
  duracao: string
  youtube_url: string
  youtube_id: string
  created_at: string
  turma?: Turma
}

export type Atendimento = {
  id: string
  mentor_id: string
  aluno_id: string
  data: string
  nota: number
  observacao: string
  created_at: string
  mentor?: Mentor
  aluno?: Aluno
}
