import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, flowType: 'implicit' },
  global: {
    fetch: (url, options = {}) => {
      const urlStr = url instanceof Request ? url.url : String(url)
      if (urlStr.includes('/auth/v1/')) {
        // Timeout de 10s em requests de auth — evita lock infinito no cliente JS
        const ctrl = new AbortController()
        const tid = setTimeout(() => ctrl.abort(), 10000)
        return fetch(url, { ...options, signal: options.signal ?? ctrl.signal })
          .finally(() => clearTimeout(tid))
      }
      return fetch(url, { ...options, keepalive: true })
    },
  },
})

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

export type AtendimentoMentoria = {
  id: string
  mentor: string
  aluno: string | null
  data_atendimento: string
  tipo: string
  duracao_minutos: number
  valor_pago: number
  descricao: string | null
  encaminhamento_psico: boolean
  arquivo_gemini_url: string | null
  link_gemini: string | null
  link_gravacao: string | null
  solicitacao_aluno: string | null
}

export type PesquisaCsat = {
  id: string
  nome: string
  data: string
}

export type RespostaCsat = {
  id: string
  pesquisa_id: string
  mentor: string
  qualidade_atendimento: number
  organizacao_planejamento: number
  diferencial_mentoria: number
  clareza_orientacoes: number
  acompanhamento_cobranca: number
  comunicacao_relacao: number
}
