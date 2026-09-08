// Regra de geração e distribuição das tarefas do Mapa de Erros para Revisão.
// Funções puras — sem acesso a banco — para poderem ser testadas isoladamente.

export type Nivel = 'alta' | 'media' | 'baixa'
export type TipoTarefa = 'teoria' | 'lista' | 'ambos'

export const NIVEIS: Nivel[] = ['alta', 'media', 'baixa']
export const LABEL_NIVEL: Record<Nivel, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' }

/**
 * Prioridade de um tópico: 1 (mais urgente) a 3, ou null quando não gera tarefa.
 *
 *   dificuldade ALTA  → gera sempre; a incidência só ordena a fila
 *   dificuldade MÉDIA → gera quando a incidência é ALTA ou MÉDIA ("cai muito")
 *   dificuldade BAIXA → nunca gera
 */
export function calcularPrioridade(incidencia?: Nivel | null, dificuldade?: Nivel | null): number | null {
  if (!incidencia || !dificuldade) return null
  if (dificuldade === 'alta')  return incidencia === 'alta' ? 1 : incidencia === 'media' ? 2 : 3
  if (dificuldade === 'media') return incidencia === 'alta' ? 2 : incidencia === 'media' ? 3 : null
  return null
}

export type ItemMapa = {
  id: string
  materia_nome: string
  topico_nome: string
  incidencia?: Nivel | null
  dificuldade?: Nivel | null
  incluir: boolean
  tipo: TipoTarefa
  minutos_teoria: number
  minutos_lista: number
}

export type Bloco = {
  itemId: string
  materia: string
  topico: string
  tipo: 'teoria' | 'lista'
  minutos: number
  prioridade: number
}

/** Expande os itens que geram tarefa em blocos agendáveis, já na ordem da fila. */
export function montarBlocos(itens: ItemMapa[]): Bloco[] {
  const porPrioridade = new Map<number, Bloco[]>()

  for (const it of itens) {
    const p = calcularPrioridade(it.incidencia, it.dificuldade)
    if (p === null || !it.incluir) continue
    const base = { itemId: it.id, materia: it.materia_nome, topico: it.topico_nome, prioridade: p }
    const doItem: Bloco[] = []
    if (it.tipo === 'teoria' || it.tipo === 'ambos') doItem.push({ ...base, tipo: 'teoria', minutos: it.minutos_teoria })
    if (it.tipo === 'lista'  || it.tipo === 'ambos') doItem.push({ ...base, tipo: 'lista',  minutos: it.minutos_lista })
    if (!porPrioridade.has(p)) porPrioridade.set(p, [])
    porPrioridade.get(p)!.push(...doItem)
  }

  // Dentro de cada prioridade, alterna as matérias para o aluno não passar
  // um dia inteiro na mesma disciplina.
  const fila: Bloco[] = []
  for (const p of [...porPrioridade.keys()].sort((a, b) => a - b)) {
    const porMateria = new Map<string, Bloco[]>()
    for (const b of porPrioridade.get(p)!) {
      if (!porMateria.has(b.materia)) porMateria.set(b.materia, [])
      porMateria.get(b.materia)!.push(b)
    }
    const grupos = [...porMateria.values()]
    let restam = true
    while (restam) {
      restam = false
      for (const g of grupos) {
        const b = g.shift()
        if (b) { fila.push(b); restam = true }
      }
    }
  }
  return fila
}

export type BlocoAgendado = Bloco & { data: string; hora_inicio: string; hora_fim: string }

export type ResultadoDistribuicao = {
  agendados: BlocoAgendado[]
  sobra: Bloco[]           // não couberam na janela
  minutosSobra: number
  minutosCapacidade: number
  minutosAgendados: number
}

const pad = (n: number) => String(n).padStart(2, '0')
const hhmm = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`

/** Lista as datas ISO de inicio..fim, inclusive, sem tropeçar em fuso. */
export function listarDias(inicio: string, fim: string): string[] {
  const dias: string[] = []
  const d = new Date(inicio + 'T12:00:00')
  const last = new Date(fim + 'T12:00:00')
  while (d <= last) {
    dias.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return dias
}

/**
 * Distribui os blocos ao longo da janela respeitando as horas livres de cada
 * dia da semana. Preenche dia a dia, em ordem cronológica e por prioridade,
 * evitando repetir matéria no mesmo dia enquanto houver alternativa.
 *
 * O que não couber volta em `sobra` — nunca é descartado em silêncio.
 */
export function distribuir(
  blocos: Bloco[],
  opts: { dataInicio: string; dataFim: string; horaInicio: string; horasSemana: number[] },
): ResultadoDistribuicao {
  const { dataInicio, dataFim, horaInicio, horasSemana } = opts
  const agendados: BlocoAgendado[] = []
  const pendentes = [...blocos]
  const colocados = new Set<string>()   // `${itemId}:${tipo}`
  const [h0, m0] = horaInicio.split(':').map(Number)
  const inicioMin = (h0 || 0) * 60 + (m0 || 0)

  const dias = (!dataInicio || !dataFim) ? [] : listarDias(dataInicio, dataFim)
  let minutosCapacidade = 0

  for (const dia of dias) {
    const dow = new Date(dia + 'T12:00:00').getDay()
    let restante = Math.round((horasSemana[dow] || 0) * 60)
    minutosCapacidade += restante
    if (restante <= 0) continue

    let cursor = inicioMin
    const materiasDoDia = new Set<string>()

    // Duas passadas: primeiro matérias inéditas no dia, depois libera repetição.
    for (const exigirVariedade of [true, false]) {
      let i = 0
      while (i < pendentes.length) {
        const b = pendentes[i]
        // a lista de um tópico nunca vem antes da sua teoria
        const teoriaPendente = b.tipo === 'lista'
          && pendentes.some(o => o.itemId === b.itemId && o.tipo === 'teoria')
          && !colocados.has(`${b.itemId}:teoria`)
        const cabe = b.minutos <= restante
        const variedadeOk = !exigirVariedade || !materiasDoDia.has(b.materia)

        if (!cabe || !variedadeOk || teoriaPendente) { i++; continue }

        agendados.push({ ...b, data: dia, hora_inicio: hhmm(cursor), hora_fim: hhmm(cursor + b.minutos) })
        colocados.add(`${b.itemId}:${b.tipo}`)
        materiasDoDia.add(b.materia)
        cursor += b.minutos
        restante -= b.minutos
        pendentes.splice(i, 1)
      }
    }
  }

  const minutosAgendados = agendados.reduce((s, b) => s + b.minutos, 0)
  return {
    agendados,
    sobra: pendentes,
    minutosSobra: pendentes.reduce((s, b) => s + b.minutos, 0),
    minutosCapacidade,
    minutosAgendados,
  }
}

/** "2h30" / "45min" */
export function formatarMinutos(min: number): string {
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60), m = min % 60
  return m ? `${h}h${pad(m)}` : `${h}h`
}
