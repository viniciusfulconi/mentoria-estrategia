// Preparação do import Ciclo 6 — parse das 3 fontes + resolução de id_aluno.
// NÃO escreve nada. Gera /tmp/ciclo6_todosdados.json e imprime relatório de resolução.
const fs = require('fs');
const XLSX = require('xlsx');

const DESK = '/Users/viniciusfulconi/Desktop/Ciclo 6';
const DL = '/Users/viniciusfulconi/Downloads';
const ANULADAS = new Set([16]); // Q16 Física anulada — todos ganham o ponto

const norm = s => String(s || '')
  .replace(/\s*\(PEC\)\s*/gi, '')
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ').trim();
const numBR = s => {
  s = String(s ?? '').trim();
  if (s === '') return null;
  s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
};

// ---- gabarito ----
const gab = {};
XLSX.utils.sheet_to_json(XLSX.readFile(`${DESK}/gabarito-ciclo6-1a-fase.xlsx`).Sheets['Planilha1'], { header: 1 })
  .forEach(r => { const m = String(r[0] || '').match(/Q\s*(\d+)\s*-\s*([A-E])/i); if (m) gab['Q' + m[1]] = m[2].toUpperCase(); });

const BLOCOS = { mat: [1, 12], fis: [13, 24], qui: [25, 36], ing: [37, 48] };
function acertosDe(getResp) {
  const ac = { mat: 0, fis: 0, qui: 0, ing: 0 };
  const nq = {};
  for (const [mt, [a, b]] of Object.entries(BLOCOS)) {
    for (let q = a; q <= b; q++) {
      let acertou;
      if (ANULADAS.has(q)) acertou = 1;
      else {
        const resp = String(getResp(q) || '').trim().toUpperCase();
        acertou = (resp && resp === gab['Q' + q]) ? 1 : 0;
      }
      ac[mt] += acertou;
      nq['Q' + q] = acertou;
    }
  }
  return { ac, nq };
}

const registros = [];

// ---- Fonte 1: presencial CSV (valores OFICIAIS) ----
const raw = fs.readFileSync(`${DL}/AppSheet.ViewData.2026-07-01 (2).csv`, 'utf8');
const lines = raw.split(/\r?\n/).filter(l => l.length);
const hdr = lines[0].split(';').map(h => h.replace(/^﻿/, '').replace(/^"|"$/g, ''));
const ix = {}; hdr.forEach((h, i) => ix[h] = i);
const parseCsv = l => { const o = []; let c = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ';' && !q) { o.push(c); c = ''; } else c += ch; } o.push(c); return o; };
for (let i = 1; i < lines.length; i++) {
  const c = parseCsv(lines[i]);
  const nome = (c[ix['Aluno']] || '').replace(/^"|"$/g, '').trim();
  if (!nome) continue;
  const { nq } = acertosDe(q => (c[ix['Q' + q]] || '').replace(/"/g, ''));
  registros.push({
    _src: 'presencial', _nome_orig: nome, fase: '1fase',
    media_1fase: numBR(c[ix['Média 1a Fase']]),
    acertos_mat_1f: numBR(c[ix['Acertos Matemática']]),
    acertos_fis_1f: numBR(c[ix['Acertos Física']]),
    acertos_qui_1f: numBR(c[ix['Acertos Química']]),
    acertos_ing_1f: numBR(c[ix['Acertos Inglês']]),
    notas_questoes: nq,
    mentor_file: (c[ix['Mentor do Aluno']] || '').replace(/"/g, '').trim() || null,
  });
}

// ---- Fonte 2: PEC xlsx (CALCULAR com Q16 anulada) ----
const pecRows = XLSX.utils.sheet_to_json(XLSX.readFile(`${DL}/ciclo6_1fase.xlsx`).Sheets['Resultado da consulta']);
for (const r of pecRows) {
  const nome = String(r['Nome'] || '').trim();
  if (!nome) continue;
  const { ac, nq } = acertosDe(q => r['Q' + String(q).padStart(2, '0')] ?? r['Q' + q]);
  registros.push({
    _src: 'pec', _nome_orig: nome, fase: '1fase',
    media_1fase: +(((ac.mat + ac.fis + ac.qui) / 36 * 10).toFixed(4)),
    acertos_mat_1f: ac.mat, acertos_fis_1f: ac.fis, acertos_qui_1f: ac.qui, acertos_ing_1f: ac.ing,
    notas_questoes: nq, mentor_file: null,
  });
}

// ---- Fonte 3: 2ª fase Mat/Quí ----
const r2 = XLSX.utils.sheet_to_json(XLSX.readFile(`${DESK}/ciclo6-2afase-notas.xlsx`).Sheets['Ciclo 6'], { header: 1 });
// layout: 0=nome; 1..10 MAT Q, 11 NOTA MAT; 13..22 QUI Q, 23 NOTA QUI
for (let i = 3; i < r2.length; i++) {
  const row = r2[i]; const nome = String(row[0] || '').trim();
  if (!nome) continue;
  const notaMat = typeof row[11] === 'number' ? row[11] : null;
  const notaQui = typeof row[23] === 'number' ? row[23] : null;
  if (notaMat !== null) {
    const nq = {}; for (let q = 0; q < 10; q++) if (typeof row[1 + q] === 'number') nq['Q' + (q + 1)] = row[1 + q];
    // Pula linha totalmente em branco (NOTA=0 e nenhuma questão) = aluno não fez a 2ª fase.
    if (!(notaMat === 0 && Object.keys(nq).length === 0))
      registros.push({ _src: '2fase', _nome_orig: nome, fase: '2fase_mat', nota_matematica: +notaMat.toFixed(4), notas_questoes: nq, mentor_file: null });
  }
  if (notaQui !== null) {
    const nq = {}; for (let q = 0; q < 10; q++) if (typeof row[13 + q] === 'number') nq['Q' + (q + 1)] = row[13 + q];
    if (!(notaQui === 0 && Object.keys(nq).length === 0))
      registros.push({ _src: '2fase', _nome_orig: nome, fase: '2fase_qui', nota_quimica: +notaQui.toFixed(4), notas_questoes: nq, mentor_file: null });
  }
}

// ---- Resolução de id_aluno ----
const ad = JSON.parse(fs.readFileSync('/tmp/ad_raw.json', 'utf8')).rows;
const rk = JSON.parse(fs.readFileSync('/tmp/rk_raw.json', 'utf8')).rows;
const adMap = new Map(); ad.forEach(a => adMap.set(norm(a.nome), a));
const rkMap = new Map(); rk.forEach(a => { if (!rkMap.has(norm(a.nome_aluno))) rkMap.set(norm(a.nome_aluno), a); });

// nomes completos do próprio Ciclo 6 (1ª fase PEC) para cruzar abreviados da 2ª fase
const c6full = new Set(registros.filter(r => r.fase === '1fase').map(r => norm(r._nome_orig)));

function resolve(nomeOrig) {
  const n = norm(nomeOrig);
  if (adMap.has(n)) return { id_aluno: adMap.get(n).id_aluno, nome: adMap.get(n).nome, mentor: adMap.get(n).mentor, ingresso: adMap.get(n).ingresso, via: 'alunos_dados' };
  if (rkMap.has(n)) return { id_aluno: rkMap.get(n).id_aluno, nome: rkMap.get(n).nome_aluno, mentor: null, via: 'ranking' };
  return null;
}
// candidatos fuzzy: todos os tokens do nome (abreviado) presentes num nome do DB PEC/qualquer
function fuzzy(nomeOrig) {
  const toks = norm(nomeOrig).split(' ').filter(Boolean);
  const cands = [];
  for (const a of ad) {
    const an = norm(a.nome);
    if (toks.every(t => an.split(' ').includes(t))) cands.push({ id_aluno: a.id_aluno, nome: a.nome, ingresso: a.ingresso, mentor: a.mentor });
  }
  return cands;
}

const alunosUnicos = [...new Set(registros.map(r => r._nome_orig))];
const resolvidos = {}; const naoResolvidos = [];
for (const nomeOrig of alunosUnicos) {
  const r = resolve(nomeOrig);
  if (r) resolvidos[nomeOrig] = r;
  else naoResolvidos.push(nomeOrig);
}

console.log('=== RESUMO ===');
console.log('registros de fase:', registros.length,
  '| 1fase:', registros.filter(r => r.fase === '1fase').length,
  '| 2fase_mat:', registros.filter(r => r.fase === '2fase_mat').length,
  '| 2fase_qui:', registros.filter(r => r.fase === '2fase_qui').length);
console.log('alunos únicos:', alunosUnicos.length, '| resolvidos:', Object.keys(resolvidos).length, '| não resolvidos:', naoResolvidos.length);

console.log('\n=== NÃO RESOLVIDOS (precisam de confirmação) ===');
naoResolvidos.sort().forEach(nomeOrig => {
  const srcs = [...new Set(registros.filter(r => r._nome_orig === nomeOrig).map(r => r.fase))].join(',');
  const cands = fuzzy(nomeOrig);
  console.log(`\n• "${nomeOrig}"  [fases: ${srcs}]`);
  if (!cands.length) console.log('    → sem candidato no banco (provável ALUNO NOVO)');
  else cands.forEach(c => console.log(`    → cand: ${c.nome}  (id=${c.id_aluno}, ingresso=${c.ingresso}, mentor=${c.mentor || '—'})`));
});

fs.writeFileSync('/tmp/ciclo6_registros.json', JSON.stringify({ registros, resolvidos, naoResolvidos }, null, 0));
console.log('\n(salvo em /tmp/ciclo6_registros.json)');
