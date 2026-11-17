import type { APIRoute } from 'astro';
import global from '../styles/global.css?raw';
import editorial from '../styles/editorial.css?raw';

// Decap renders widget previews in a separate document.
export const GET: APIRoute = () => new Response(global + '\n' + editorial + `
  body:has(.aup-reflection-preview) { margin: 0; }
`, { headers: { 'Content-Type': 'text/css; charset=utf-8' } });
