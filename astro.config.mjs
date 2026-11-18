import { readFile, writeFile } from 'node:fs/promises';
import { defineConfig } from 'astro/config';

const adminDirectoryIndex = {
  name: 'admin-directory-index',
  hooks: {
    'astro:build:done': async ({ dir }) => {
      const branch = process.env.CF_PAGES_BRANCH;
      if (!branch || branch === 'main') return;

      const path = new URL('admin/config.yml', dir);
      const config = await readFile(path, 'utf8');
      if (!/^  branch: main$/m.test(config)) {
        throw new Error('Expected the production branch in the Decap configuration');
      }
      await writeFile(path, config.replace(/^  branch: main$/m, () => '  branch: ' + JSON.stringify(branch)));
    },
    'astro:server:setup': ({ server }) => {
      server.middlewares.use((request, _response, next) => {
        if (request.url === '/admin' || request.url === '/admin/') {
          request.url = '/admin/index.html';
        }
        next();
      });
    },
  },
};


// Poetry is line-based: preserve single Markdown newlines as real verse breaks.
// Scope strictly to the poem collection; prose elsewhere keeps normal Markdown.
function preservePoemVerseBreaks() {
  return (tree, file) => {
    const source = String(file?.path || '').replace(/\\\\/g, '/');
    if (!/(?:^|\/)src\/content\/poemes\//.test(source)) return;
    function visit(node) {
      if (!node || !Array.isArray(node.children)) return;
      const children = [];
      for (const child of node.children) {
        if (child.type === 'text' && typeof child.value === 'string' && /\r?\n/.test(child.value)) {
          const parts = child.value.split(/\r?\n/);
          parts.forEach((part, index) => {
            if (index) children.push({ type: 'break' });
            if (part) children.push({ type: 'text', value: part });
          });
        } else {
          visit(child);
          children.push(child);
        }
      }
      node.children = children;
    }
    visit(tree);
  };
}

export default defineConfig({
  site: 'https://www.aupositeur.be',
  output: 'static',
  markdown: { remarkPlugins: [preservePoemVerseBreaks] },
  build: { format: 'directory' },
  integrations: [adminDirectoryIndex],
});
