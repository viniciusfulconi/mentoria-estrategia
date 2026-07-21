// ─────────────────────────────────────────────────────────────────────────────
// Consolidação de notas em ranking por ciclo+concurso.
//
// Esta lógica foi EXTRAÍDA de app/simulados/upload/page.tsx SEM nenhuma alteração
// de fórmula, para ser reutilizada por dois fluxos:
//   1. Upload de planilha (app/simulados/upload)
//   2. Edição manual de notas (app/gestao/notas) → recalculo automático
//
// Manter uma única fonte de verdade garante que o ranking recalculado após uma
// edição seja IDÊNTICO ao que o upload produziria. Qualquer mudança de critério
// (médias, aprovação, ordenação) deve ser feita aqui — e vale para os dois fluxos.
// ─────────────────────────────────────────────────────────────────────────────

// Média final do ciclo para exibição/ordenação. `media_2fase` já é a média final
// (para ITA inclui a 1ª fase no cálculo); cai para `media_1fase` só quando a 2ª
// fase ainda não fechou (`media_2fase` = null). Zero é nota válida (aluno zerou).
// Fonte única — antes esta regra estava copiada em 7+ páginas.
export function mediaFinalCiclo(r: { media_2fase?: number | null; media_1fase?: number | null }): number | null {
  if (r?.media_2fase != null) return Number(r.media_2fase)
  if (r?.media_1fase != null) return Number(r.media_1fase)
  return null
}

// Recebe as linhas de fase (1fase, 2fase_mat, 2fase_fis, ...) de um ou mais
// ciclos/concursos e devolve uma linha consolidada fase='ranking' por aluno.
export function calcularRankings(todosDados: any[]): any[] {
  // Detecta quais fases foram uploadadas por ciclo+concurso
  // Se uma fase existe para qualquer aluno do ciclo, aluno sem nota = ausente = 0
  const fasesExistentes: Record<string, Set<string>> = {}
  todosDados.forEach(r => {
    const key = `${r.ciclo_nome}__${r.concurso}`
    if (!fasesExistentes[key]) fasesExistentes[key] = new Set()
    fasesExistentes[key].add(r.fase)
  })

  // Agrupa por aluno + ciclo
  const grupos: Record<string, any> = {}
  todosDados.forEach(r => {
    const key = `${r.id_aluno}__${r.ciclo_nome}__${r.concurso}`
    if (!grupos[key]) grupos[key] = { ...r, fases: {} }
    grupos[key].fases[r.fase] = r
  })

  const rankings: any[] = []
  Object.values(grupos).forEach((g: any) => {
    const existentes = fasesExistentes[`${g.ciclo_nome}__${g.concurso}`] || new Set()

    const f1 = g.fases['1fase']
    const fmat = g.fases['2fase_mat']
    const ffis = g.fases['2fase_fis']
    const fqui = g.fases['2fase_qui']
    const fport = g.fases['2fase_port']
    const fing = g.fases['2fase_ing']

    // Fase uploadada mas aluno sem nota = ausente = 0 (não exclui do denominador).
    // Mesma regra para 1ª fase: faltou e a fase foi uploadada → 0.
    const nota1f  = f1?.media_1fase   ?? (existentes.has('1fase')     ? 0 : null)
    const notaMat = fmat?.nota_matematica ?? (existentes.has('2fase_mat') ? 0 : null)
    const notaFis = ffis?.nota_fisica ?? (existentes.has('2fase_fis') ? 0 : null)
    const notaQui = fqui?.nota_quimica ?? (existentes.has('2fase_qui') ? 0 : null)
    // Português tem TRÊS estados, não dois:
    //   linha com media_linguagens        → usa a nota;
    //   linha SEM media_linguagens        → redação pendente: fica fora da média e o
    //                                       ciclo DESSE aluno segue 'Em andamento';
    //   sem linha, com a fase uploadada   → faltou na prova = 0 (regra das demais fases).
    // O `??` anterior misturava os dois últimos e zerava quem só esperava a redação.
    //
    // O critério é media_linguagens, NUNCA nota_redacao: no IME a redação não entra na
    // média (media_linguagens = português puro, nota_redacao nula por definição) e há
    // ciclos ITA antigos gravados no mesmo formato. Ler nota_redacao reabriria ciclos
    // fechados no próximo recálculo.
    const notaPort = fport
      ? (fport.media_linguagens ?? null)
      : (existentes.has('2fase_port') ? 0 : null)
    // Inglês: no IME é componente OBRIGATÓRIO da 2ª fase (o ciclo tem aba '2fase_ing')
    // → ausência vira 0, como as demais matérias. No ITA não existe 2ª fase de inglês,
    // então 'existentes' nunca tem '2fase_ing' e a ausência continua null (excluída).
    const notaIng = fing?.nota_ingles ?? (existentes.has('2fase_ing') ? 0 : null)

    let mediaFinal = null
    let resultado = null

    if (g.concurso === 'ITA') {
      // Média ITA: (1ªFase + Mat + Fis + Qui + Port) / 5
      const notas = [nota1f, notaMat, notaFis, notaQui, notaPort].filter(n => n !== null)
      if (notas.length > 0) {
        mediaFinal = notas.reduce((a, b) => a + b, 0) / notas.length
        if (notas.length === 5) {
          const reprovado = [notaMat, notaFis, notaQui, notaPort].some(n => (n as number) < 4.0)
          resultado = (mediaFinal >= 5.0 && !reprovado) ? 'Aprovado' : 'Reprovado'
        } else {
          resultado = 'Em andamento'
        }
      }
    } else {
      // Média IME: (3*Mat + 2.5*Fis + 2.5*Qui + 1*Port + 1*Ing) / 10
      if (notaMat !== null || notaFis !== null || notaQui !== null || notaPort !== null || notaIng !== null) {
        const notas2f = [notaMat, notaFis, notaQui, notaPort, notaIng]
        const pesos = [3, 2.5, 2.5, 1, 1]
        let soma = 0, pesoTotal = 0
        notas2f.forEach((n, i) => {
          if (n !== null) { soma += (n as number) * pesos[i]; pesoTotal += pesos[i] }
        })
        mediaFinal = pesoTotal > 0 ? soma / pesoTotal : null

        const todasPresentes = [notaMat, notaFis, notaQui, notaPort].every(n => n !== null)
        if (todasPresentes) {
          const reprovado = [notaMat, notaFis, notaQui, notaPort].some(n => (n as number) < 4.0)
          resultado = !reprovado ? 'Aprovado' : 'Reprovado'
        } else {
          resultado = 'Em andamento'
        }
      }
    }

    rankings.push({
      ciclo_nome: g.ciclo_nome,
      concurso: g.concurso,
      id_aluno: g.id_aluno,
      nome_aluno: g.nome_aluno,
      mentor: g.mentor,
      fase: 'ranking',
      media_1fase: nota1f,
      nota_matematica: notaMat,
      nota_fisica: notaFis,
      nota_quimica: notaQui,
      media_linguagens: notaPort,
      nota_ingles: notaIng,
      media_2fase: mediaFinal,
      resultado_ciclo: resultado,
    })
  })

  return rankings
}

// Ordena os rankings por media_2fase (desc) dentro de cada ciclo+concurso e
// grava a posição em `classificacao` (1 = melhor). Mesma regra do upload:
//   grupo.sort((a, b) => (b.media_2fase ?? 0) - (a.media_2fase ?? 0))
export function ordenarEClassificar(rankings: any[]): any[] {
  const porCiclo: Record<string, any[]> = {}
  rankings.forEach(r => {
    const k = `${r.ciclo_nome}__${r.concurso}`
    if (!porCiclo[k]) porCiclo[k] = []
    porCiclo[k].push(r)
  })
  Object.values(porCiclo).forEach(grupo => {
    grupo.sort((a, b) => {
      const d = (b.media_2fase ?? 0) - (a.media_2fase ?? 0)
      if (Math.abs(d) > 1e-9) return d
      // desempate estável por id_aluno → ordem determinística entre médias iguais
      return String(a.id_aluno) < String(b.id_aluno) ? -1 : 1
    })
    grupo.forEach((r, i) => { r.classificacao = i + 1 })
  })
  return rankings
}
