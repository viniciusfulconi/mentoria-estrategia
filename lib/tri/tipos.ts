// Tipos do módulo ENEM. No Play estes tipos moram em lib/types.ts junto com o
// resto do domínio; aqui ficam ao lado do motor de TRI para o módulo ser
// autocontido e poder ser atualizado copiando a pasta inteira.

export type EnemArea = 'CH' | 'CN' | 'LC' | 'MT'

export const ENEM_AREAS: { key: EnemArea; label: string; short: string }[] = [
  { key: 'LC', label: 'Linguagens, Códigos e suas Tecnologias', short: 'Linguagens' },
  { key: 'CH', label: 'Ciências Humanas e suas Tecnologias',    short: 'Humanas' },
  { key: 'CN', label: 'Ciências da Natureza e suas Tecnologias', short: 'Natureza' },
  { key: 'MT', label: 'Matemática e suas Tecnologias',           short: 'Matemática' },
]

/** Uma área dentro da definição da prova. LC guarda as duas línguas separadas. */
export type EnemAreaEntry = {
  area: EnemArea
  base?: number           // offset de numeração no cartão (CH base 45 → questões 46–90)
  question_ids?: string[] // áreas não-LC
  comuns?: string[]       // LC: 40 questões comuns
  ingles?: string[]       // LC: 5 de Inglês
  espanhol?: string[]     // LC: 5 de Espanhol
}

/** Linking por área daquele ano: nota = A + B·θ. Vem de enem_provas.calibracao. */
export type CalibracaoEnem = Partial<Record<EnemArea, { A: number; B: number }>>
