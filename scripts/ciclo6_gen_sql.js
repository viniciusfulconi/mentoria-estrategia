// Gera o SQL do import Ciclo 6 a partir de /tmp/ciclo6_registros.json.
// Reusa calcularRankings/ordenarEClassificar da produção (lib/rankings.ts).
const fs = require('fs');
const { calcularRankings, ordenarEClassificar } = require('../lib/rankings.ts');

const { registros, resolvidos } = JSON.parse(fs.readFileSync('/tmp/ciclo6_registros.json', 'utf8'));

// Overrides manuais confirmados pelo usuário (nome planilha → id no banco).
const OVERRIDES = {
  'Alexis Stanley (PEC)': '421bbf63',
  'Claudemir Albino (PEC)': 'bbb9e50f',
  'Daniel Gomes (PEC)': 'd9f7df89',
  'GEOVANNA MAGALHÃES': '538a5db3',
  'Leonardo Bertasso (PEC)': 'aa29a35f',
  'Marcelo Edson (PEC)': 'ee317345',
  'Marcos Araujo (PEC)': 'ef90a6c4',
};

// Mapa id → dados canônicos do banco (nome/mentor/ingresso) via /tmp/ad_raw.json.
const ad = JSON.parse(fs.readFileSync('/tmp/ad_raw.json', 'utf8')).rows;
const rk = JSON.parse(fs.readFileSync('/tmp/rk_raw.json', 'utf8')).rows;
const adById = new Map(ad.map(a => [a.id_aluno, a]));
const rkById = new Map(); rk.forEach(a => { if (!rkById.has(a.id_aluno)) rkById.set(a.id_aluno, a); });

function canonNome(id, fallback) {
  const a = adById.get(id); if (a && a.nome) return a.nome;
  const r = rkById.get(id); if (r && r.nome_aluno) return r.nome_aluno;
  return fallback;
}
function canonMentor(id, fallback) {
  const a = adById.get(id); if (a && a.mentor) return a.mentor;
  return fallback || null;
}

// Anexa id_aluno / nome_aluno / mentor a cada registro.
const CICLO = 'Ciclo 6', CONCURSO = 'ITA';
const todosDados = [];
const naoResolvidosReais = [];
// Dedup 1fase por id: aluno em ambas as fontes (presencial e PEC) → mantém presencial (oficial).
const seen1f = new Set();
const ordem = registros.slice().sort((a, b) => (a.fase === '1fase' && a._src === 'presencial' ? -1 : 0) - (b.fase === '1fase' && b._src === 'presencial' ? -1 : 0));
for (const r of ordem) {
  const nomeOrig = r._nome_orig;
  let id = OVERRIDES[nomeOrig] || (resolvidos[nomeOrig] && resolvidos[nomeOrig].id_aluno);
  if (!id) { naoResolvidosReais.push(nomeOrig); continue; }
  if (r.fase === '1fase') {
    if (seen1f.has(id)) { console.error(`  dedup 1fase: descartando ${r._src} "${nomeOrig}" (id ${id} já tem 1fase)`); continue; }
    seen1f.add(id);
  }
  todosDados.push({
    ...r,
    ciclo_nome: CICLO, concurso: CONCURSO,
    id_aluno: id,
    nome_aluno: canonNome(id, nomeOrig),
    mentor: canonMentor(id, r.mentor_file),
  });
}
if (naoResolvidosReais.length) {
  console.error('ABORTAR — ainda há não resolvidos:', [...new Set(naoResolvidosReais)]);
  process.exit(1);
}

// Consolida rankings com a MESMA função da produção.
const rankings = ordenarEClassificar(calcularRankings(todosDados));

// Detecta duplicatas (id, fase) antes de gerar.
const seen = new Set();
for (const r of todosDados) {
  const k = `${r.id_aluno}__${r.fase}`;
  if (seen.has(k)) { console.error('DUPLICATA', k, r._nome_orig); }
  seen.add(k);
}

// ---- SQL ----
const esc = s => s === null || s === undefined ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`;
const num = n => n === null || n === undefined ? 'NULL' : Number(n);
const jsonb = o => (o && Object.keys(o).length) ? `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb` : 'NULL';
const initcap = s => esc(s); // nome já canônico do banco

const cols = ['ciclo_nome', 'concurso', 'id_aluno', 'nome_aluno', 'mentor', 'fase',
  'media_1fase', 'nota_matematica', 'nota_fisica', 'nota_quimica', 'media_linguagens',
  'nota_ingles', 'media_2fase', 'resultado_ciclo', 'classificacao',
  'acertos_mat_1f', 'acertos_fis_1f', 'acertos_qui_1f', 'acertos_ing_1f',
  'notas_questoes', 'resultado'];

function rowSQL(r) {
  return '(' + [
    esc(r.ciclo_nome), esc(r.concurso), esc(r.id_aluno), initcap(r.nome_aluno), esc(r.mentor), esc(r.fase),
    num(r.media_1fase), num(r.nota_matematica), num(r.nota_fisica), num(r.nota_quimica), num(r.media_linguagens),
    num(r.nota_ingles), num(r.media_2fase), esc(r.resultado_ciclo), r.classificacao ? Number(r.classificacao) : 'NULL',
    num(r.acertos_mat_1f), num(r.acertos_fis_1f), num(r.acertos_qui_1f), num(r.acertos_ing_1f),
    jsonb(r.notas_questoes), esc(r.resultado),
  ].join(', ') + ')';
}

const allRows = [...todosDados, ...rankings];
let sql = `-- Import Ciclo 6 (1ª fase + 2ª fase Mat/Quí) — gerado por scripts/ciclo6_gen_sql.js\nBEGIN;\n\n`;
sql += `-- Segurança: aborta se Ciclo 6 já tiver linhas.\nDO $$ BEGIN IF EXISTS (SELECT 1 FROM resultados WHERE ciclo_nome='Ciclo 6') THEN RAISE EXCEPTION 'Ciclo 6 já existe — abortando'; END IF; END $$;\n\n`;
sql += `INSERT INTO resultados (${cols.join(', ')}) VALUES\n`;
sql += allRows.map(rowSQL).join(',\n') + ';\n\nCOMMIT;\n';

fs.writeFileSync('/tmp/upload_ciclo6.sql', sql);

// Relatório
const byFase = {};
todosDados.forEach(r => byFase[r.fase] = (byFase[r.fase] || 0) + 1);
console.log('Fases:', byFase, '| ranking rows:', rankings.length);
console.log('Total linhas no INSERT:', allRows.length);
console.log('resultado_ciclo distintos:', [...new Set(rankings.map(r => r.resultado_ciclo))]);
console.log('media_2fase range:', Math.min(...rankings.map(r => r.media_2fase ?? 99)).toFixed(3), '-', Math.max(...rankings.map(r => r.media_2fase ?? -1)).toFixed(3));
// amostras
const amostra = rankings.filter(r => /Patrick|Alessandro|Alexis/i.test(r.nome_aluno));
amostra.forEach(r => console.log(`  ${r.nome_aluno}: 1f=${r.media_1fase} mat=${r.nota_matematica} qui=${r.nota_quimica} media2=${r.media_2fase} ${r.resultado_ciclo} CL=${r.classificacao}`));
console.log('\nSQL salvo em /tmp/upload_ciclo6.sql');
