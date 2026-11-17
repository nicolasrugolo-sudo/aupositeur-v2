// The email renderer accepts structured nodes, never arbitrary markup.
const tags = new Set(['p','h2','h3','strong','em','ul','ol','li','a','img','br']);
const escape = value => value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function url(value, image) {
  if (typeof value !== 'string' || value.length > 1500) throw Error('URL invalide');
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw Error('Une URL HTTPS est requise');
  if (image && (!['www.aupositeur.be','aupositeur.be'].includes(parsed.host) ||
    !/^\/images\/(?:[a-z0-9_.%-]+\/)*[a-z0-9_.%-]+\.(?:png|jpe?g|gif)$/i.test(parsed.pathname) ||
    /%|\.\./.test(parsed.pathname) || parsed.search || parsed.hash)) {
    throw Error('Utilise une image JPG, PNG ou GIF publiée dans /images/ sur AUPOSITEUR');
  }
  return parsed.href;
}

export function renderNewsletter(nodes) {
  let remaining = 1000, characters = 0;
  const visit = (node, depth) => {
    if (--remaining < 0 || depth > 20) throw Error('Message trop complexe');
    if (typeof node === 'string') {
      characters += node.length;
      if (characters > 15000) throw Error('Message trop long');
      return {html:escape(node),text:node};
    }
    if (!node || !tags.has(node.tag)) throw Error('Mise en forme inconnue');
    const tag = node.tag;
    if (tag === 'br') return {html:'<br>',text:'\n'};
    if (tag === 'img') {
      const src=url(node.src,true), alt=typeof node.alt==='string'?node.alt.trim():'';
      if (!alt || alt.length>200) throw Error('Un texte alternatif est requis pour chaque image');
      return {html:'<img src="'+escape(src)+'" alt="'+escape(alt)+'" width="560" style="display:block;max-width:100%;height:auto">',text:'\n['+alt+']\n'};
    }
    if (!Array.isArray(node.children)) throw Error('Structure de message invalide');
    const children=node.children.map(child=>visit(child,depth+1));
    const html=children.map(child=>child.html).join(''), text=children.map(child=>child.text).join('');
    if (tag === 'a') {
      const href=url(node.href,false);
      return {html:'<a href="'+escape(href)+'">'+html+'</a>',text:text+' ('+href+')'};
    }
    const separator=['p','h2','h3','li','ul','ol'].includes(tag)?'\n':'';
    return {html:'<'+tag+'>'+html+'</'+tag+'>',text:(tag==='li'?'• ':'')+text+separator};
  };
  if (!Array.isArray(nodes)) throw Error('Document invalide');
  const rendered=nodes.map(node=>visit(node,0));
  const html=rendered.map(node=>node.html).join('');
  const text=rendered.map(node=>node.text).join('').trim();
  if(html.length>100000||text.length>15000)throw Error('Message trop long');
  return {html,text};
}
