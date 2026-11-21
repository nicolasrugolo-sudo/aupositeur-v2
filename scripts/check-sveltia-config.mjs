#!/usr/bin/env node
/**
 * Guardrail for an isolated Sveltia CMS prototype.
 * Run: node scripts/check-sveltia-config.mjs path/to/config.yml
 * Does not modify any files or contact GitHub.
 */
import { readFile } from 'node:fs/promises';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/check-sveltia-config.mjs <test-config.yml>');
  process.exit(2);
}
const config = await readFile(file, 'utf8');
const backend = config.match(/^backend:\s*\n((?:^[ \t]+.*\n|^\s*\n)*)/m)?.[1] ?? '';
const get = (name) => backend.match(new RegExp('^\\s+' + name + ':\\s*(.+?)\\s*$', 'm'))?.[1]?.replace(/^['"]|['"]$/g, '') ?? '';
const repo = get('repo');
const branch = get('branch');
const errors = [];
if (!/^[-\w.]+\/[-\w.]+$/.test(repo)) errors.push('backend.repo absent ou invalide');
if (repo.toLowerCase() === 'nicolasrugolo-sudo/aupositeur-v2') errors.push('DANGER : dépôt de production interdit pour la recette');
if (!branch || ['main','master'].includes(branch.toLowerCase())) errors.push('DANGER : branche principale interdite pour la recette');
if (!/publish_mode:\s*editorial_workflow/.test(config)) errors.push('publish_mode: editorial_workflow absent');
if (errors.length) {
  console.error('Recette Sveltia bloquée :\n- ' + errors.join('\n- '));
  process.exit(1);
}
console.log('Configuration de recette isolée :', repo, '/', branch);
console.log('Contrôle statique réussi ; OAuth et permissions restent à vérifier en conditions réelles.');
