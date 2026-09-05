// Resolve o alias `@/…` do tsconfig para o Node dos testes.
//
// Os módulos de servidor (lib/sync-simulados.ts) importam por `@/lib/…`, que o
// bundler do Next entende e o Node não — sem isto só dá para testar as camadas
// puras que não importam nada, e a de escrita ficaria sem cobertura justamente
// por ser a que fala com o banco.
//
// Uso:  node --import ./scripts/alias-hooks.mjs --test …
import { registerHooks } from 'node:module'
import { existsSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, resolve as resolvePath } from 'node:path'

const raiz = dirname(dirname(fileURLToPath(import.meta.url)))

// O código de produção importa sem extensão (`@/lib/sheets-parse`), como o
// bundler permite; o Node exige o arquivo exato, então tentamos as extensões.
const EXTENSOES = ['', '.ts', '.tsx', '.mjs', '.js', '/index.ts']

function arquivoDe(caminhoBase) {
  for (const ext of EXTENSOES) {
    const tentativa = caminhoBase + ext
    if (existsSync(tentativa)) return tentativa
  }
  return null
}

registerHooks({
  resolve(especificador, contexto, seguinte) {
    if (especificador.startsWith('@/')) {
      const alvo = arquivoDe(resolvePath(raiz, especificador.slice(2)))
      if (!alvo) throw new Error(`alias-hooks: não achei "${especificador}" a partir de ${raiz}`)
      return { url: pathToFileURL(alvo).href, shortCircuit: true }
    }
    return seguinte(especificador, contexto)
  },
})
