(() => {
  const ICONS = {
    facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.03.084c-1.277.06-2.149.264-2.911.563-.789.308-1.458.72-2.123 1.388C1.33 2.702.92 3.371.615 4.162.32 4.926.12 5.799.063 7.076.007 8.354-.006 8.764 0 12.023c.006 3.259.021 3.667.083 4.947.061 1.277.264 2.148.563 2.911.308.789.72 1.457 1.388 2.123.668.665 1.336 1.074 2.129 1.38.763.295 1.636.496 2.913.552 1.277.056 1.688.069 4.946.063 3.258-.006 3.668-.021 4.948-.081 1.28-.061 2.147-.265 2.91-.563.789-.309 1.458-.72 2.123-1.388.665-.668 1.074-1.338 1.38-2.128.295-.763.496-1.636.552-2.912.056-1.281.069-1.69.063-4.948-.006-3.258-.021-3.667-.082-4.947-.061-1.28-.264-2.149-.563-2.912-.308-.789-.72-1.457-1.388-2.123C21.298 1.33 20.628.921 19.838.617 19.074.321 18.202.12 16.924.065 15.647.009 15.236-.005 11.977.001 8.718.008 8.31.022 7.03.084ZM12 5.838A6.162 6.162 0 1 0 18.162 12 6.162 6.162 0 0 0 12 5.838Zm0 10.162A4 4 0 1 1 16 12a4 4 0 0 1-4 4Zm6.39-10.414a1.44 1.44 0 1 1-1.437 1.442 1.44 1.44 0 0 1 1.437-1.442Z"/></svg>',
    pinterest: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0Z"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.59 13.41a1.996 1.996 0 0 0 2.82 0l3-3a2 2 0 1 0-2.82-2.82l-1.17 1.17-1.41-1.41 1.17-1.17a4 4 0 0 1 5.66 5.66l-3 3a4 4 0 0 1-5.66 0l-.59-.59 1.41-1.41.59.57Zm2.82-2.82a1.996 1.996 0 0 0-2.82 0l-3 3a2 2 0 1 0 2.82 2.82l1.17-1.17 1.41 1.41-1.17 1.17a4 4 0 0 1-5.66-5.66l3-3a4 4 0 0 1 5.66 0l.59.59-1.41 1.41-.59-.57Z"/></svg>'
  };

  const icon = (name, label) => `${ICONS[name]}<span class="sr-only">${label}</span>`;

  function enhance(button) {
    if (!button || button.dataset.socialEnhancedV3 === 'true') return;
    const parent = button.parentElement;
    if (!parent) return;

    const quote = button.dataset.quote || '';
    const slug = button.dataset.slug || 'citation';
    const pageUrl = `https://www.aupositeur.be/citations/${encodeURIComponent(slug)}/`;
    const publication = `« ${quote} »\n\n— AUPOSITEUR`;
    const fullText = `${publication}\n\n${pageUrl}`;
    const description = publication.length > 500 ? `${publication.slice(0, 497).trimEnd()}…` : publication;
    const socialSvg = `https://www.aupositeur.be/social/citations/${encodeURIComponent(slug)}.svg?v=20260912-2`;
    const mediaUrl = `https://images.weserv.nl/?url=${encodeURIComponent(socialSvg)}&output=png&w=1000&h=1500&fit=contain`;

    button.style.display = 'none';
    button.dataset.socialEnhancedV3 = 'true';

    const shell = document.createElement('span');
    shell.className = 'ap-unified-share';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = button.className || 'ap-share-trigger';
    trigger.innerHTML = '<span>Partager</span><i aria-hidden="true">↗</i>';
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', 'Ouvrir les options de partage');

    const menu = document.createElement('span');
    menu.className = 'ap-unified-share__menu';
    menu.hidden = true;

    const nativeAction = (network, label) => {
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'ap-share-icon';
      action.title = label;
      action.setAttribute('aria-label', `Partager sur ${label}`);
      action.innerHTML = icon(network, label);
      action.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(fullText); } catch {}
        menu.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        button.click();
      });
      return action;
    };

    menu.appendChild(nativeAction('facebook', 'Facebook'));
    menu.appendChild(nativeAction('instagram', 'Instagram / autres applications'));

    const pinterest = document.createElement('a');
    pinterest.className = 'ap-share-icon';
    pinterest.href = `https://www.pinterest.com/pin/create/button/?url=${encodeURIComponent(pageUrl)}&media=${encodeURIComponent(mediaUrl)}&description=${encodeURIComponent(description)}`;
    pinterest.target = '_blank';
    pinterest.rel = 'noopener noreferrer';
    pinterest.title = 'Pinterest';
    pinterest.setAttribute('aria-label', 'Partager sur Pinterest');
    pinterest.innerHTML = icon('pinterest', 'Pinterest');
    menu.appendChild(pinterest);

    const whatsapp = document.createElement('a');
    whatsapp.className = 'ap-share-icon';
    whatsapp.href = `https://wa.me/?text=${encodeURIComponent(fullText)}`;
    whatsapp.target = '_blank';
    whatsapp.rel = 'noopener noreferrer';
    whatsapp.title = 'WhatsApp';
    whatsapp.setAttribute('aria-label', 'Partager sur WhatsApp');
    whatsapp.innerHTML = icon('whatsapp', 'WhatsApp');
    menu.appendChild(whatsapp);

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'ap-share-icon';
    copy.title = 'Copier texte + lien';
    copy.setAttribute('aria-label', 'Copier le texte et le lien');
    copy.innerHTML = icon('link', 'Copier texte + lien');
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(fullText); } catch {}
      const status = parent.querySelector('[data-share-status]');
      if (status) {
        status.textContent = 'Texte et lien copiés.';
        setTimeout(() => { status.textContent = ''; }, 2200);
      }
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    });
    menu.appendChild(copy);

    trigger.addEventListener('click', () => {
      const opening = menu.hidden;
      document.querySelectorAll('.ap-unified-share__menu').forEach((other) => { if (other !== menu) other.hidden = true; });
      menu.hidden = !opening;
      trigger.setAttribute('aria-expanded', String(opening));
    });

    shell.appendChild(trigger);
    shell.appendChild(menu);
    parent.insertBefore(shell, button);
  }

  const style = document.createElement('style');
  style.textContent = `
    .ap-unified-share { position: relative; display: inline-flex; align-items: center; }
    .ap-unified-share__menu {
      position: absolute; z-index: 40; right: 0; bottom: calc(100% + .6rem);
      display: flex; align-items: center; gap: .35rem; padding: .55rem;
      border: 1px solid rgba(241,237,228,.18); background: rgba(8,8,8,.98);
      box-shadow: 0 18px 45px rgba(0,0,0,.38); white-space: nowrap;
    }
    .ap-unified-share__menu[hidden] { display: none !important; }
    .ap-unified-share__menu .ap-share-icon {
      width: 2.35rem; height: 2.35rem; padding: .58rem; display: inline-flex;
      align-items: center; justify-content: center; border: 0; background: transparent;
      color: #f1ede4; opacity: .72; cursor: pointer; text-decoration: none; border-radius: 999px;
    }
    .ap-unified-share__menu .ap-share-icon:hover,
    .ap-unified-share__menu .ap-share-icon:focus-visible { opacity: 1; background: rgba(241,237,228,.08); outline: none; }
    .ap-unified-share__menu .ap-share-icon svg { width: 100%; height: 100%; display: block; fill: currentColor; }
    .ap-unified-share__menu .sr-only {
      position: absolute !important; width: 1px !important; height: 1px !important; padding: 0 !important;
      margin: -1px !important; overflow: hidden !important; clip: rect(0,0,0,0) !important;
      white-space: nowrap !important; border: 0 !important;
    }
    @media (max-width:700px) {
      .ap-unified-share__menu { right:auto; left:0; }
    }
  `;
  document.head.appendChild(style);

  const enhanceAll = () => document.querySelectorAll('[data-share-image]').forEach(enhance);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhanceAll, { once: true });
  else enhanceAll();
  new MutationObserver(enhanceAll).observe(document.documentElement, { childList:true, subtree:true });
})();
