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
      const slides = Array.from(viewport.querySelectorAll<HTMLElement>(spec.slide));
      if (!slides.length) return;
      root.dataset.emblaReady = 'true';
      const previous = root.querySelector<HTMLButtonElement>(spec.previous);
      const next = root.querySelector<HTMLButtonElement>(spec.next);
      const current = root.querySelector<HTMLElement>(spec.current);
      const embla = EmblaCarousel(viewport, { align: 'center', containScroll: 'trimSnaps', loop: false, watchDrag: slides.length > 1 });
      const update = () => {
        const index = embla.selectedScrollSnap();
        if (current) current.textContent = String(index + 1);
        if (previous) previous.disabled = !embla.canScrollPrev();
        if (next) next.disabled = !embla.canScrollNext();
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
