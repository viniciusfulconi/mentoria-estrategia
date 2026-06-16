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

## Dois formatos de planilha possíveis

### Formato A — planilha "tradicional" com notas pré-calculadas
Coordenador já calculou e formatou. Usar para uploads vindos da Estratégia.

Aba `Ids Alunos` (obrigatória) com colunas: `IdAluno`, `Aluno`, `Mentor do Aluno`, `Data nascimento do Aluno`, `Ingresso na Turma`.

Abas de notas (mapeamento por nome — case-insensitive):

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

### Formato B — planilha "online/PEC" com respostas brutas
Cada linha = 1 aluno respondendo o simulado. Sem notas — vêm respostas A/B/C/D/E por questão. **Precisa de calcular acertos comparando com gabarito separado.**

Característica do formato:
- Sempre 1 aba só (geralmente `Resultado da consulta`).
- Colunas fixas: `Horario_Inicial`, `Nome`, `celular`, `Estado`, `email`, `student_id`, `CPF`, `student_exam_id`, `Nome_simulado`, `Horario_Final`, `vertical`, `data`.
- Colunas de questão: `Q01`, `Q02`, ... até `Q181` (mas só as primeiras N são reais; o resto é template lixo).
- **Gabarito vem em arquivo separado** (ex: `gabaritos_ciclos.xlsx`), uma aba por ciclo+fase, formato `Q1 / resposta / Q2 / resposta / ...` (linha ímpar = label, linha par = resposta correta).

Identificação do formato: se a planilha tem `Q01, Q02, ...` mas não tem coluna `Nota`, é formato B.

## Estrutura do simulado (descoberto em 2026-06-16 com o lote PEC)

Importante para calcular notas no formato B: a ordem das questões nas planilhas online segue um padrão consistente.

### ITA 1ª fase (Ciclos 1, 3, 4, 5) — 48 questões em 4 blocos de 12

| Questões | Matéria |
|---|---|
| Q1 – Q12 | Matemática |
| Q13 – Q24 | Física |
| Q25 – Q36 | Química |
| Q37 – Q48 | Inglês (não conta na nota) |

**Nota = `(mat + fis + qui) / 36 × 10`** — inglês fica fora.

### IME 1ª fase (Ciclo 2) — 40 questões em 3 blocos

| Questões | Matéria |
|---|---|
| Q1 – Q15 | Matemática |
| Q16 – Q30 | Física |
| Q31 – Q40 | Química |

**Nota = `(mat + fis + qui) / 40 × 10`** — IME não tem inglês na 1ª fase.

### 2ª fase português

Cálculo simples: `(acertos / total) × 10`.
- ITA (C1, C3, C4, C5): 15 questões
- IME (C2): 40 questões

### Bug histórico evitado

A primeira tentativa de import do lote PEC calculou nota = `total_acertos / total_questões × 10` (somando inglês). Resultado: notas infladas para todos os 57 alunos. Comparação com 6 alunos que apareciam em ambos PEC e DB revelou o erro (Gustavo C3 1ªfase: DB=4.72 com mat=6/fis=6/qui=5/ing=11 = 17/36×10 ≠ minha conta 28/48×10=5.83). **Sempre confirme a fórmula com pelo menos 1 aluno cruzado antes de processar em massa.**

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

### 2.5. Cruzamento com banco — DETECTA aluno duplicado entre presencial e online

**Crítico**: alunos que fazem PEC (online) podem já existir no banco como presencial. Inserir como novo cria duplicata e dados conflitantes.

```sql
-- Lista todos os alunos do banco para comparar
SELECT id_aluno, nome FROM alunos_dados;
```

Para cada aluno da planilha:
1. Normalizar nome (remover acentos, lowercase, trim) e comparar com banco normalizado.
2. **Match exato** → mesmo aluno, não inserir; oferecer atualizar/complementar dados existentes.
3. **Match parcial** (primeiro + último nome iguais) → AMBÍGUO, pedir confirmação manual ao usuário antes de qualquer ação. Bug em 2026-06-16: "Guilherme Inácio de Carvalho Silva" (PEC) foi machado falsamente com "Guilherme Almeida Gomes da Silva" (DB) — pessoas diferentes.
4. **Sem match** → novo aluno, gerar `id_aluno` (8 chars hex) e inserir.

### 2.6. Validação da fórmula com aluno cruzado (só formato B)

Antes de processar o lote inteiro:
1. Pega 1 aluno que está em AMBOS PEC e DB com `acertos_mat_1f` populado.
2. Calcula a nota PEC dele usando a fórmula proposta.
3. Compara com `media_1fase` do banco.
4. Se não bater, **PARE**. A fórmula está errada — investigar antes de processar 50+ alunos errados.

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
6. **Fórmula de nota 1ª fase com inglês incluso** (lote PEC 2026-06-16) — `(total_acertos / 48) × 10` está ERRADO. Correto: `(mat + fis + qui) / 36 × 10`, inglês excluído. Para IME C2: `(mat + fis + qui) / 40 × 10`. Sempre validar com 1 aluno cruzado antes de processar em massa.
7. **Match parcial de nomes (primeiro + último) gera falso positivo** — "Guilherme Inácio de Carvalho Silva" foi falsamente machado com "Guilherme Almeida Gomes da Silva" porque primeiro e último nome batem. Fix: match parcial vira "ambíguo, pedir confirmação manual", nunca aplicar automaticamente.
8. **Divergência de ~1 acerto entre planilha PEC e nota oficial** — comum: a prova oficial pode anular 1 questão e atribuir o acerto para todos. A planilha PEC não sabe disso. Para divergências ≤ 1 acerto, manter o valor oficial do banco (não substituir pelo PEC).

## Cruzamento DB ↔ PEC (formato B)

Quando o lote PEC inclui alunos que já existem no banco como presenciais, classificar cada (aluno, ciclo, fase) em 1 de 5 categorias e agir:

| Situação | Ação |
|---|---|
| DB tem nota, PEC tem nota igual (±0.05) | ✓ Nada a fazer |
| DB tem `0` (faltou ao presencial), PEC tem nota real | **UPDATE** DB com PEC + popular acertos por matéria |
| DB não tem registro, PEC tem nota | **INSERT** nova linha |
| DB tem nota, PEC adiciona nada | Manter DB |
| DB tem nota X, PEC tem nota Y com diff > 0.05 | Manter DB (provável questão anulada na prova oficial) |

Sempre fazer **UPDATE em alunos_dados.nome usando INITCAP** e padronizar `resultados.nome_aluno = alunos_dados.nome` após o cruzamento para evitar grafias divergentes do mesmo aluno.

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
- Import e cruzamento do lote PEC (formato B): `INSERT_ALUNOS_PEC.sql`, `PEC_CRUZA_E_CORRIGE_NOTAS.sql`, `PEC_RECALC_RANKINGS.sql`
