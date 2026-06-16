---
name: upload-simulado
description: Recebe planilha (.xlsx) com notas de simulado e faz parse → validação → INSERT direto via Supabase CLI → sanity check pós-import. Substitui o fluxo manual de /simulados/upload no app quando o coordenador prefere passar o arquivo direto. Use quando o usuário invocar `/upload-simulado <caminho>` ou disser variantes como "sobe essa planilha", "importa esse ciclo".
---

# Upload de simulado — fluxo guiado

Este skill encapsula tudo que aprendemos quebrando a cara em produção. Siga os passos na ordem; **não pule a validação**.

## Inputs esperados

- Caminho da planilha `.xlsx` (passado pelo usuário)
- Ciclo (ex: "Ciclo 6") — se não estiver explícito no nome das abas, perguntar
- Concurso (ITA ou IME) — confirmar antes do INSERT

## Estado do banco

- Projeto Supabase: `rbvoraafoysnpqxwranx` (linked via `npx supabase`)
- Tabela alvo: `public.resultados`
- Schema da tabela em `lib/supabase.ts:189-260` (tipos)
- Lógica de cálculo original: `app/simulados/upload/page.tsx:calcularRankings` (corrigida em 2026-06-15)

## Formato esperado da planilha

### Aba `Ids Alunos` (obrigatória)
Colunas: `IdAluno`, `Aluno`, `Mentor do Aluno`, `Data nascimento do Aluno`, `Ingresso na Turma`

### Abas de notas (mapeamento por nome — case-insensitive)

| Aba contém | Tipo (fase) | Colunas relevantes |
|---|---|---|
| `1a fase`, `1ª fase`, `primeira fase` | `1fase` | `Nota` (=media_1fase), `Acertos Matemática/Física/Química/Inglês` |
| `matem` | `2fase_mat` | `Nota` (=nota_matematica), `Pontos Inteiros` |
| `fisic` | `2fase_fis` | `Nota` (=nota_fisica), `Pontos Inteiros` |
| `quim` | `2fase_qui` | `Nota` (=nota_quimica), `Pontos Inteiros` |
| `port`, `lingu`, `redac` | `2fase_port` | `Nota` (=nota_portugues), `Nota Redacao`, opc. `Media Linguagens` |
| `ingl` | `2fase_ing` | `Nota` (=nota_ingles) |
| Notas de questões: colunas `Q1`, `Q2`, ... | qualquer fase | viram `notas_questoes` JSONB |

Ignorar: `Processo Seletivo`, qualquer aba contendo `Ranking`, `Simulado Zero`, `Ciclo 0`, `Diagnóstico`.

## Cálculos (NUNCA confiar na coluna pré-calculada da planilha sem validar)

### `media_linguagens` em `2fase_port`
```
media_linguagens = (nota_portugues + nota_redacao) / 2
```
Se a planilha trouxer `Media Linguagens` e bater (±0.05), usa ela; senão prevalece o cálculo. **Bug histórico**: planilha do Ciclo 5 não tinha essa coluna e o código pegou só `Nota` (port), gerando 77 médias erradas. Já corrigido no código, mas a planilha pode esconder novos casos.

### `media_2fase` (linha `ranking`)

**ITA**: média simples das presentes
```
media_2fase = (1f + mat + fis + qui + linguagens) / N_presentes
```

**IME**: ponderada
```
media_2fase = (3·mat + 2.5·fis + 2.5·qui + 1·port + 1·ing) / soma_pesos_presentes
```

### Ausência → 0 (não exclui do denominador) quando a fase foi importada
Se o ciclo tem aba `2fase_mat` mas o aluno não aparece nela, ele entra como 0 em matemática (não NULL). Mesma regra para todas as fases inclusive `1fase`.

### Regra de aprovação

**ITA**: todas as 5 presentes (1f, mat, fis, qui, port) E nenhuma das 4 (mat/fis/qui/port) `< 4.0` E `media_2fase ≥ 5.0`.

**IME**: todas as 4 (mat, fis, qui, port) presentes E nenhuma `< 4.0`.

Caso contrário: `Reprovado` (se todas as obrigatórias estão lá mas falhou critério) ou `Em andamento` (se falta alguma).

## Workflow — sempre nesta ordem

### 1. Preview (NÃO insere ainda)
- Lê planilha (`xlsx` via Node ou Python — tem `xlsx` no node_modules do projeto)
- Lista abas detectadas e quantos alunos por aba
- Lista alunos sem ID (serão ignorados — flagar)
- Mostra resumo ao usuário e pede confirmação

### 2. Validação pré-INSERT
Checagens **obrigatórias** antes de gerar qualquer SQL:

```sql
-- a) Ciclo já existe no banco?
SELECT DISTINCT fase FROM resultados WHERE ciclo_nome = '<Ciclo>' ORDER BY fase;
```
Se sim → perguntar: substituir, adicionar, ou abortar.

```sql
-- b) Quantos alunos com Title Case vs CAIXA ALTA na planilha?
```
Bug histórico: nome em CAIXA ALTA em aba diferente cria ghost row. Normalizar nomes com `INITCAP` antes do INSERT.

```sql
-- c) ID Aluno consistente?
```
Alguns IDs vêm como `null` string ou vazios; cruzar com `Ids Alunos` por nome.

### 3. Geração do SQL
Para cada linha lida:
- `id_aluno` = string text (NÃO uuid; o schema usa text)
- `nome_aluno` em Title Case via `INITCAP()`
- Notas como `numeric(10,4)`
- Computar `media_linguagens` no host se vier null/inconsistente
- Inserir **uma linha por fase** (`1fase`, `2fase_mat`, etc.)
- Depois inserir **linha consolidada** `fase='ranking'` com `media_2fase` e `resultado_ciclo` calculados

### 4. Execução
```bash
npx supabase db query --linked -f /tmp/upload_<ciclo>.sql
```
Sempre via `--linked` (o projeto está linked com `rbvoraafoysnpqxwranx`).

### 5. Sanity check pós-import (NÃO pular)
Rodar **as 6 invariantes**:

```sql
-- 1. Notas no range [0, 10]
SELECT COUNT(*) FROM resultados
WHERE ciclo_nome = '<Ciclo>'
  AND (media_1fase NOT BETWEEN 0 AND 10
    OR nota_matematica NOT BETWEEN 0 AND 10
    OR nota_fisica NOT BETWEEN 0 AND 10
    OR nota_quimica NOT BETWEEN 0 AND 10
    OR media_linguagens NOT BETWEEN 0 AND 10
    OR nota_redacao NOT BETWEEN 0 AND 10
    OR nota_portugues NOT BETWEEN 0 AND 10
    OR media_2fase NOT BETWEEN 0 AND 10
    OR nota_ingles NOT BETWEEN 0 AND 10);
-- esperado: 0
```

```sql
-- 2. media_linguagens = (port + red)/2 quando ambos presentes
SELECT COUNT(*) FROM resultados
WHERE fase = '2fase_port' AND ciclo_nome = '<Ciclo>'
  AND nota_portugues IS NOT NULL AND nota_redacao IS NOT NULL
  AND ABS(media_linguagens - (nota_portugues + nota_redacao)/2) > 0.05;
-- esperado: 0
```

```sql
-- 3. ranking row casa com source 2fase_*
-- (query completa em FIX_CICLO5_MEDIA_LINGUAGENS.sql / parte de checagem)
```

```sql
-- 4. media_2fase consistente com a fórmula
-- (query completa rodada em 2026-06-16; reusar a CTE)
```

```sql
-- 5. resultado_ciclo consistente com regra
-- (query completa rodada em 2026-06-16; reusar a CTE)
```

```sql
-- 6. Duplicatas (mesmo id_aluno+ciclo+fase)
SELECT id_aluno, ciclo_nome, fase, COUNT(*)
FROM resultados WHERE ciclo_nome = '<Ciclo>'
GROUP BY 1, 2, 3 HAVING COUNT(*) > 1;
-- esperado: 0
```

Se qualquer falhar, **investigar antes de seguir**. Não trate como warning.

### 6. Relatório final ao usuário
- Linhas inseridas por fase
- Alunos com mudanças de status (Reprovado/Aprovado/Em andamento) se for reimportação
- Outliers detectados (ex: notas extremas, alunos só com zeros)

## Bugs históricos a evitar

1. **Coluna `Media Linguagens` ausente** → código usava só `Nota` (port). Fix: sempre calcular `(port+red)/2` quando ambos existem.
2. **Nomes em CAIXA ALTA em alguma aba** → ghost row duplicada com tudo zerado. Fix: `INITCAP` antes de inserir, dedup case-insensitive por `(id_aluno, ciclo, fase)`.
3. **Ausência da 1ª fase tratada diferente das outras** → aluno faltoso à 1ª fase virava "Em andamento" enquanto faltoso à 2ª virava "Reprovado" com 0. Fix: regra simétrica para todas as fases.
4. **Notas de redação atualizadas por SQL direto sem recalcular `ranking`** → linha consolidada continuava errada. Fix: sempre recalcular `ranking` quando mexer em fase 2.
5. **Nota de redação inflada em 10x** (ex: 84.0 em vez de 8.4) — outlier no CSV de redação do Ciclo 5. Validação: notas > 10 são suspeitas; perguntar antes de inserir.

## Rollback

Cada upload deve ser preceditado de um snapshot do estado anterior:
```sql
\copy (SELECT * FROM resultados WHERE ciclo_nome = '<Ciclo>') TO '/tmp/<ciclo>_backup_<timestamp>.csv' CSV HEADER;
```

Se algo der errado:
```sql
DELETE FROM resultados WHERE ciclo_nome = '<Ciclo>';
-- depois restaurar do backup via \copy ... FROM
```

## Memory & autorização

- Confirmar com o usuário antes de **qualquer** INSERT/UPDATE/DELETE em `resultados`
- Memória persistente: `~/.claude/projects/-Users-viniciusfulconi/memory/MEMORY.md` registra que produção exige autorização explícita
- Nunca rodar via service_role sem cross-check de papel via `verifyAuth` (mas via Supabase CLI o user está autenticado como dono do projeto, ok)

## Arquivos de referência no repo

- Schema: `lib/supabase.ts`
- Lógica original de cálculo: `app/simulados/upload/page.tsx`
- Correção da fórmula linguagens: `FIX_CICLO5_MEDIA_LINGUAGENS.sql`
- Recalc de ranking: `RECALC_RANKING_PORT_AUSENTE.sql`
- Limpeza de fantasmas: `CLEAN_GHOST_ROWS_AND_CASE.sql`
