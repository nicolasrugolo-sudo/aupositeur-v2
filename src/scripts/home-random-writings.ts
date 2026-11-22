/**
 * Sélection aléatoire des écrits sur l'accueil.
 * Fonctionne côté navigateur pour renouveler la liste sans reconstruire Astro.
 * Les œuvres mises en avant dans Studio précèdent les œuvres tirées au sort.
 * Les œuvres tirées au sort sont ensuite classées par année décroissante.
 */
const shuffleWritings = (): void => {
  document.querySelectorAll<HTMLElement>('[data-random-writings]').forEach((list) => {
    const pool = Array.from(list.querySelectorAll<HTMLElement>(':scope > .ap-reading-portrait-layout__item'));
    const featured = pool.filter(item => item.hasAttribute('data-editorial-featured'));
    const writings = pool.filter(item => !item.hasAttribute('data-editorial-featured'));
    const limit = Math.max(1, Number(list.dataset.randomWritings) || 5);
    for (let i = writings.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [writings[i], writings[j]] = [writings[j], writings[i]];
    }
    const selected = [...featured, ...writings].slice(0, limit);
    // Tri stable : au sein d'une même année, l'ordre aléatoire est conservé.
    const yearOf = (writing: HTMLElement): number => {
      const label = writing.querySelector<HTMLElement>('.ap-reading-portrait-layout__year')?.textContent?.trim() ?? '';
      const year = Number(label);
      return Number.isFinite(year) && year > 0 ? year : 0;
    };
    selected.sort((a, b) => Number(b.hasAttribute('data-editorial-featured')) - Number(a.hasAttribute('data-editorial-featured')) || yearOf(b) - yearOf(a));
    list.replaceChildren(...selected);
  });
};

shuffleWritings();
document.addEventListener('astro:page-load', shuffleWritings);
