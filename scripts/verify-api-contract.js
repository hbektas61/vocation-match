#!/usr/bin/env node
/**
 * Checks that the calls the app makes actually exist in the database.
 *
 * The TypeScript client and the SQL are written by hand in two places, so a
 * renamed argument (`p_query` -> `query`) or a dropped column would compile,
 * lint, and pass every unit test — and then fail on a real device against a
 * real project. This reads the calls out of `mobile/src/data/supabaseApi.ts`
 * and compares them against the live catalog in the migrated test database.
 *
 * Usage: node scripts/verify-api-contract.js
 * Requires the test container from supabase/scripts/db-test.sh to be running.
 */
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const ROOT = join(__dirname, '..');
const CONTAINER = process.env.VOCATION_DB_CONTAINER || 'vocation_db_test';
const DB = process.env.VOCATION_DB_NAME || 'postgres';

function query(sql) {
  return execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', DB, '-qtA', '-c', sql],
    { encoding: 'utf8' },
  ).trim();
}

const source = readFileSync(join(ROOT, 'mobile/src/data/supabaseApi.ts'), 'utf8');

/* ------------------------------------------------------------------ parse */

const rpcCalls = [];
const rpcPattern = /\.rpc\(\s*'([a-z_]+)'\s*(?:,\s*\{([\s\S]*?)\})?\s*\)/g;
for (const match of source.matchAll(rpcPattern)) {
  const args = [...(match[2] ?? '').matchAll(/(\w+)\s*:/g)].map((m) => m[1]);
  rpcCalls.push({ name: match[1], args: args.sort() });
}

// `rpcSingle('name', { ... })` is the helper wrapper around the same thing.
const helperPattern = /rpcSingle<\w+>\(\s*'([a-z_]+)'\s*,\s*\{([\s\S]*?)\}/g;
for (const match of source.matchAll(helperPattern)) {
  const args = [...match[2].matchAll(/(\w+)\s*:/g)].map((m) => m[1]);
  rpcCalls.push({ name: match[1], args: args.sort() });
}

const tables = new Set([...source.matchAll(/\.from\('(\w+)'\)/g)].map((m) => m[1]));

const selects = [];
for (const match of source.matchAll(/\.from\('(\w+)'\)[\s\S]{0,200}?\.select\('([^']+)'\)/g)) {
  selects.push({
    table: match[1],
    columns: match[2].split(',').map((c) => c.trim()).filter(Boolean),
  });
}

/* ---------------------------------------------------------------- compare */

const problems = [];

if (rpcCalls.length === 0 || tables.size === 0) {
  problems.push('parsed nothing out of supabaseApi.ts — the checker itself is broken');
}

const catalog = new Map();
for (const line of query(`
  select p.proname || '\t' || coalesce(array_to_string(p.proargnames, ','), '')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
`).split('\n')) {
  if (!line) continue;
  const [name, argList] = line.split('\t');
  const args = (argList || '')
    .split(',')
    .filter(Boolean)
    // OUT parameters of a `returns table (...)` function are in proargnames
    // too; only the `p_`-prefixed ones are things a caller passes.
    .filter((a) => a.startsWith('p_'));
  catalog.set(name, args);
}

for (const call of rpcCalls) {
  const declared = catalog.get(call.name);
  if (!declared) {
    problems.push(`rpc('${call.name}') does not exist in the database`);
    continue;
  }
  const unknown = call.args.filter((a) => !declared.includes(a));
  if (unknown.length) {
    problems.push(
      `rpc('${call.name}') passes ${unknown.join(', ')} — the function takes ${declared.join(', ') || '(no arguments)'}`,
    );
  }
}

const existingTables = new Set(
  query(`
    select table_name from information_schema.tables where table_schema = 'public'
  `).split('\n').filter(Boolean),
);

for (const table of tables) {
  if (!existingTables.has(table)) {
    problems.push(`from('${table}') — no such table in public`);
  }
}

for (const { table, columns } of selects) {
  if (!existingTables.has(table)) continue;
  const existing = new Set(
    query(`
      select column_name from information_schema.columns
       where table_schema = 'public' and table_name = '${table}'
    `).split('\n').filter(Boolean),
  );
  const missing = columns.filter((c) => !existing.has(c));
  if (missing.length) {
    problems.push(`from('${table}').select(...) asks for ${missing.join(', ')}, which the table does not have`);
  }
}

/* ----------------------------------------------------------------- report */

const checked = `${rpcCalls.length} RPC calls, ${tables.size} tables, ${selects.length} column lists`;

if (problems.length) {
  console.error(`\nAPI contract mismatch (checked ${checked}):\n`);
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  console.error('');
  process.exit(1);
}

console.log(`  the client's ${checked} all match the database`);
