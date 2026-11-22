/**
 * Sélection aléatoire des écrits sur l'accueil.
 * Fonctionne côté navigateur pour renouveler la liste sans reconstruire Astro.
 * Aucun doublon au sein des douze œuvres présentées.
 * Les œuvres tirées au sort sont ensuite classées par année décroissante.
 */
const shuffleWritings = (): void => {
  document.querySelectorAll<HTMLElement>('[data-random-writings]').forEach((list) => {
    const writings = Array.from(list.querySelectorAll<HTMLElement>(':scope > .ap-reading-portrait-layout__item'));
    const limit = Math.max(1, Number(list.dataset.randomWritings) || 12);
    for (let i = writings.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [writings[i], writings[j]] = [writings[j], writings[i]];
    }
    const selected = writings.slice(0, limit);
    // Tri stable : au sein d'une même année, l'ordre aléatoire est conservé.
    const yearOf = (writing: HTMLElement): number => {
      const label = writing.querySelector<HTMLElement>('.ap-reading-portrait-layout__year')?.textContent?.trim() ?? '';
      const year = Number(label);
      return Number.isFinite(year) && year > 0 ? year : 0;
    };
    selected.sort((a, b) => yearOf(b) - yearOf(a));
    list.replaceChildren(...selected);
  });
};

shuffleWritings();
document.addEventListener('astro:page-load', shuffleWritings);
