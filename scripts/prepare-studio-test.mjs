import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const branch = 'test/studio-editorial';
assert.equal(git('branch', '--show-current'), branch);
assert.equal(git('remote'), '', 'Use a disposable checkout without Git remotes.');
assert.equal(git('status', '--porcelain'), '', 'Start from a clean checkout.');
assert.ok(process.argv[2], 'Pass the path of the installed Decap bundle.');

const root = 'public/studio-test';
mkdirSync(root, { recursive: true });
appendFileSync('.git/info/exclude', '\n/public/studio-test/\n');
copyFileSync(process.argv[2], root + '/decap-cms.js');
const configuration = readFileSync('public/admin/config.yml', 'utf8');
assert.match(configuration, /^backend:\n(?:[ \t]+[^\n]*\n)+/);
const mode = process.env.STUDIO_WORKFLOW === 'editorial' ? 'publish_mode: editorial_workflow\n' : '';
writeFileSync(root + '/config.yml', configuration.replace(/^backend:\n(?:[ \t]+[^\n]*\n)+/, () =>
  `backend:\n  name: git-gateway\n  branch: ${branch}\nlocal_backend:\n  url: http://127.0.0.1:8081/api/v1\n  allowed_hosts: [127.0.0.1, localhost]\n${mode}`
));
for (const name of ['studio-previews.js', 'audio-widget.js', 'shop-hd-widget.js']) {
  copyFileSync('public/admin/' + name, root + '/' + name);
}
writeFileSync(root + '/index.html', `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' http://127.0.0.1:8081; frame-src 'self' blob:; form-action 'self'; object-src 'none'; base-uri 'none'">
<link rel="cms-config-url" type="text/yaml" href="./config.yml">
<title>AUPOSITEUR — Studio de test</title>
</head>
<body>
<p style="margin:0;padding:.65rem 1rem;background:#171717;color:#fff;font:1rem system-ui">Studio de test · dépôt local · ${branch}</p>
<script src="./decap-cms.js"></script>
<script src="./studio-previews.js"></script>
<script src="./shop-hd-widget.js"></script>
<script src="./audio-widget.js"></script>
</body>
</html>
`);
console.log('Studio local : http://127.0.0.1:4327/studio-test/');
