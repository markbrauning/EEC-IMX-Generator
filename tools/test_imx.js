#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

function parseCsv(text) {
  const rows = [];
  let i = 0, field = '', row = [], q = false;
  while (i < text.length) {
    const c = text[i++];
    if (q) {
      if (c === '"') {
        if (text[i] === '"') { field += '"'; i++; }
        else q = false;
      } else field += c;
      continue;
    }
    if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const headers = rows.shift() || [];
  return rows.filter(r => r.length && r.some(v => String(v).trim() !== '')).map(r => Object.fromEntries(headers.map((h, idx) => [h, r[idx] ?? ''])));
}

function loadTables(baseDir) {
  const out = {};
  for (const file of fs.readdirSync(baseDir)) {
    if (!file.endsWith('.csv')) continue;
    const tableName = path.basename(file, '.csv');
    const raw = fs.readFileSync(path.join(baseDir, file), 'utf8').replace(/^\uFEFF/, '');
    const records = parseCsv(raw);
    out[tableName] = { records };
  }
  return out;
}

function findGolden(rootDir) {
  const candidates = [];
  function walk(d) {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      if (ent.name === '.git' || ent.name === 'node_modules') continue;
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (/\.imx$/i.test(ent.name)) candidates.push(full);
    }
  }
  walk(rootDir);
  return candidates[0] || null;
}

function firstDiff(a, b) {
  const al = a.split(/\r?\n/), bl = b.split(/\r?\n/);
  const n = Math.max(al.length, bl.length);
  for (let i = 0; i < n; i++) {
    if ((al[i] ?? '') !== (bl[i] ?? '')) return { line: i + 1, a: al[i] ?? '', b: bl[i] ?? '', alen: al.length, blen: bl.length };
  }
  return null;
}

(async () => {
  const repo = process.cwd();
  const siteId = process.argv[2] || 'EPLANTRAINING';
  const tables = loadTables(path.join(repo, 'web', 'srcdata'));
  const mod = await import(pathToFileURL(path.join(repo, 'web', 'src', 'generator', 'imxGenerator.js')).href);
  const result = mod.generateIMX({ tables, siteId, options: { siteIdColumn: 'Site_ID' } });

  const golden = findGolden(repo);
  if (!golden) {
    console.log('WARNING: No golden .imx file found.');
    console.log(`Generated length: ${result.imxText.length} chars`);
    console.log(`Warnings: ${result.warnings.length}`);
    process.exit(0);
  }

  const goldenText = fs.readFileSync(golden, 'utf8').replace(/^\uFEFF/, '');
  const diff = firstDiff(result.imxText, goldenText);
  if (!diff) {
    console.log(`MATCH: Generated output matches ${path.relative(repo, golden)}`);
    process.exit(0);
  }

  console.log(`MISMATCH: ${path.relative(repo, golden)}`);
  console.log(`First difference at line ${diff.line}`);
  console.log(`Generated: ${diff.a}`);
  console.log(`Golden   : ${diff.b}`);
  console.log(`Line counts: generated=${diff.alen}, golden=${diff.blen}`);
  process.exit(1);
})();
