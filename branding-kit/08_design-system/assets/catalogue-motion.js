(() => {
  const header = document.querySelector('.masthead');
  const links = [...document.querySelectorAll('.brand-navigation a')];
  let frame = 0;
  const update = () => { frame=0; header?.classList.toggle('is-scrolled',scrollY>24); };
  addEventListener('scroll',()=>{ if(!frame) frame=requestAnimationFrame(update); },{passive:true});
  update();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const sections = [...document.querySelectorAll('main>section[id]')];
  const observer = new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        if(entry.intersectionRatio>.15) links.forEach(link=>{
          if(link.hash===`#${entry.target.id}`) link.setAttribute('aria-current','location');
          else link.removeAttribute('aria-current');
        });
      }
    });
  },{threshold:[0,.15,.4],rootMargin:'0px 0px -5% 0px'});
  sections.forEach(section=>{
    if(!reduced.matches && section.getBoundingClientRect().top>innerHeight) section.classList.add('reveal-ready');
    observer.observe(section);
  });
  reduced.addEventListener('change',()=>{ if(reduced.matches) sections.forEach(section=>section.classList.remove('reveal-ready')); });
})();
