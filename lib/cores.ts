// Cores padrão das matérias — usado em toda a plataforma
export const CORES_MATERIA: Record<string, string> = {
  'Matemática':       '#2563EB', // roxo
  'Física':           '#1E88E5', // azul
  'Química':          '#E53935', // vermelho
  'Português':        '#FB8C00', // laranja
  'Inglês':           '#8E24AA', // lilás
  'Biologia':         '#43A047', // verde
  'Redação':          '#F4511E', // laranja escuro
  'História':         '#6D4C41', // marrom
  'Geografia':        '#546E7A', // cinza azulado
}

export function corMateria(materia: string): string {
  return CORES_MATERIA[materia] || '#2563EB'
}
