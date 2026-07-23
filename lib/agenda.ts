// Cores por matéria — importado do arquivo central
export { CORES_MATERIA } from './cores'
import { CORES_MATERIA } from './cores'

// Cores por tipo de atividade
export const CORES_TIPO: Record<string, { bg: string, text: string }> = {
  aula: { bg: '#E8E8E8', text: '#333333' },
  simulado: { bg: '#FF7043', text: '#FFFFFF' },
  vestibular: { bg: '#212121', text: '#FFFFFF' },
  prova_antiga: { bg: '#5C6BC0', text: '#FFFFFF' },
  estudo: { bg: '#2563EB', text: '#FFFFFF' },
  pessoal: { bg: '#26A69A', text: '#FFFFFF' },
  tarefa: { bg: '#7C3AED', text: '#FFFFFF' },
}

export function corAtividade(ativ: any): { bg: string, text: string } {
  if (ativ.tipo === 'estudo' && ativ.materia) {
    const cor = CORES_MATERIA[ativ.materia] || '#2563EB'
    return { bg: cor, text: '#FFFFFF' }
  }
  if (ativ.tipo === 'pessoal' && ativ.cor) {
    return { bg: ativ.cor, text: '#FFFFFF' }
  }
  return CORES_TIPO[ativ.tipo] || { bg: '#2563EB', text: '#FFFFFF' }
}

export function formatHora(dt: string | Date): string {
  const d = new Date(dt)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function formatData(dt: string | Date): string {
  const d = new Date(dt)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function diffHoras(inicio: string, fim: string): number {
  return (new Date(fim).getTime() - new Date(inicio).getTime()) / 3600000
}

export function diasParaData(dataAlvo: string): number {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const alvo = new Date(dataAlvo)
  alvo.setHours(0, 0, 0, 0)
  return Math.ceil((alvo.getTime() - hoje.getTime()) / 86400000)
}

// Expande atividades recorrentes para um intervalo de datas
export function expandirRecorrentes(atividades: any[], dataInicio: Date, dataFim: Date): any[] {
  const resultado: any[] = []
  for (const a of atividades) {
    if (!a.recorrente) {
      resultado.push(a)
      continue
    }
    // Gera ocorrências dentro do intervalo
    const inicio = new Date(Math.max(new Date(a.recorrencia_inicio).getTime(), dataInicio.getTime()))
    const fim = new Date(Math.min(new Date(a.recorrencia_fim).getTime(), dataFim.getTime()))
    const cur = new Date(inicio)
    while (cur <= fim) {
      if (cur.getDay() === a.dia_semana) {
        const dtInicio = new Date(a.data_inicio)
        const dtFim = a.data_fim ? new Date(a.data_fim) : null
        const ocorrencia = new Date(cur)
        ocorrencia.setHours(dtInicio.getHours(), dtInicio.getMinutes())
        const ocorrenciaFim = dtFim ? new Date(cur) : null
        if (ocorrenciaFim && dtFim) ocorrenciaFim.setHours(dtFim.getHours(), dtFim.getMinutes())
        resultado.push({
          ...a,
          data_inicio: ocorrencia.toISOString(),
          data_fim: ocorrenciaFim?.toISOString(),
          id: `${a.id}_${ocorrencia.toISOString()}`,
        })
      }
      cur.setDate(cur.getDate() + 1)
    }
  }
  return resultado.sort((a, b) => new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime())
}

export const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
