/**
 * Sélection aléatoire des écrits sur l'accueil.
 * Fonctionne côté navigateur pour renouveler la liste sans reconstruire Astro.
 * Aucun doublon au sein des douze œuvres présentées.
 */
const shuffleWritings = (): void => {
  document.querySelectorAll<HTMLElement>('[data-random-writings]').forEach((list) => {
    const writings = Array.from(list.querySelectorAll<HTMLElement>(':scope > .ap-reading-portrait-layout__item'));
    const limit = Math.max(1, Number(list.dataset.randomWritings) || 12);
    for (let i = writings.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [writings[i], writings[j]] = [writings[j], writings[i]];
    }
    list.replaceChildren(...writings.slice(0, limit));
  });
};

shuffleWritings();
document.addEventListener('astro:page-load', shuffleWritings);
