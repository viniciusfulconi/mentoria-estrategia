// Escrita em blocos concorrentes, com aborto no primeiro erro.
//
// O padrão que isto substitui é o laço `for (…) { await db.update(…) }`: correto,
// mas o custo é RTT × nº de linhas e nada mais — as linhas são independentes
// (update/insert de linha única, chaveado por id) e não há ordem a preservar.
//
// Virou problema quando o sync passou a gravar `notas_questoes`: o gap-fill do
// detalhamento pega ~2300 linhas de fase de uma vez e o recálculo em seguida
// reescreve ~880 linhas de ranking, o que em série passa dos 300 s de
// maxDuration da rota (teto do plano, não dá para subir). A função morria no
// meio — escrita pela metade, sem recálculo e sem `sync_log`, porque o log só é
// gravado no fim e some junto.
export const CONCORRENCIA = 10

// `escrever` devolve a mensagem de erro (string) ou null em caso de sucesso.
// Devolve o primeiro erro encontrado, ou null se tudo passou.
export async function emBlocos<T>(
  itens: T[],
  escrever: (item: T) => Promise<string | null>,
): Promise<string | null> {
  for (let i = 0; i < itens.length; i += CONCORRENCIA) {
    const erros = await Promise.all(itens.slice(i, i + CONCORRENCIA).map(escrever))
    const erro = erros.find((e) => e)
    if (erro) return erro
  }
  return null
}
