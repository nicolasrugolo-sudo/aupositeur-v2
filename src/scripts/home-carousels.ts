import EmblaCarousel from 'embla-carousel';

type CarouselSpec = {
  root: string;
  viewport: string;
  slide: string;
  previous: string;
  next: string;
  current: string;
};

const specs: CarouselSpec[] = [
  { root: '[data-quote-carousel]', viewport: '.ap-home-quote__track', slide: '.ap-home-quote__slide', previous: '[data-quote-prev]', next: '[data-quote-next]', current: '[data-quote-current]' },
  { root: '[data-reflection-carousel]', viewport: '.ap-reflection-carousel__track', slide: '.ap-reflection-carousel__slide', previous: '[data-reflection-prev]', next: '[data-reflection-next]', current: '[data-reflection-current]' },
  { root: '[data-music-carousel]', viewport: '.ap-music-carousel__track', slide: '.ap-music-carousel__slide', previous: '[data-music-prev]', next: '[data-music-next]', current: '[data-music-current]' },
  { root: '[data-book-carousel]', viewport: '.ap-book-carousel__track', slide: '.ap-book-carousel__slide', previous: '[data-book-prev]', next: '[data-book-next]', current: '[data-book-current]' },
];

const initialize = () => {
  specs.forEach((spec) => {
    document.querySelectorAll<HTMLElement>(spec.root).forEach((root) => {
      if (root.dataset.emblaReady === 'true') return;
      const viewport = root.querySelector<HTMLElement>(spec.viewport);
      if (!viewport) return;
      // Sur l'accueil statique, mélanger les citations dans le navigateur à chaque
      // actualisation, puis ne garder que huit citations différentes.
      // Fisher-Yates garantit un tirage sans doublons parmi les œuvres publiées.
      if (root.dataset.randomQuotes) {
        const container = viewport.querySelector<HTMLElement>('.ap-home-quote__container');
        if (container) {
          const quotes = Array.from(container.querySelectorAll<HTMLElement>(spec.slide));
          for (let i = quotes.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [quotes[i], quotes[j]] = [quotes[j], quotes[i]];
          }
          const limit = Math.max(1, Number(root.dataset.randomQuotes) || 8);
          container.replaceChildren(...quotes.slice(0, limit));
          // Le partage doit être initialisé sur les boutons APRÈS ce remplacement.
          document.dispatchEvent(new CustomEvent('aupositeur:quotes-ready'));
        }
      }
      const slides = Array.from(viewport.querySelectorAll<HTMLElement>(spec.slide));
      if (!slides.length) return;
      root.dataset.emblaReady = 'true';
      const previous = root.querySelector<HTMLButtonElement>(spec.previous);
      const next = root.querySelector<HTMLButtonElement>(spec.next);
      const current = root.querySelector<HTMLElement>(spec.current);
      const embla = EmblaCarousel(viewport, { align: 'center', containScroll: false, loop: false, watchDrag: slides.length > 1 });
      const dots = document.createElement('div');
      dots.className = 'ap-carousel-dots';
      dots.setAttribute('role', 'group');
      dots.setAttribute('aria-label', 'Choisir une diapositive');
      const dotButtons = slides.map((_, index) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'ap-carousel-dot';
        dot.setAttribute('aria-label', `Aller à la diapositive ${index + 1}`);
        dot.addEventListener('click', () => embla.scrollTo(index));
        dots.append(dot);
        return dot;
      });
      if (slides.length > 1) root.append(dots);
      const update = () => {
        const index = embla.selectedScrollSnap();
        if (current) current.textContent = String(index + 1);
        if (previous) previous.disabled = !embla.canScrollPrev();
        if (next) next.disabled = !embla.canScrollNext();
        dotButtons.forEach((dot, i) => {
          dot.classList.toggle('is-active', i === index);
          dot.setAttribute('aria-current', i === index ? 'true' : 'false');
        });
        slides.forEach((slide, i) => {
          slide.classList.toggle('is-active', i === index);
          slide.setAttribute('aria-label', `${i + 1} sur ${slides.length}`);
        });
      };
      previous?.addEventListener('click', () => embla.scrollPrev());
      next?.addEventListener('click', () => embla.scrollNext());
      embla.on('select', update);
      embla.on('reInit', update);
      update();
    });
  });
};
initialize();
document.addEventListener('astro:page-load', initialize);
