/* Progressive enhancement: native selects remain the no-script fallback. */
(() => {
  let dismiss = () => {};
  document.querySelectorAll('select').forEach(select => {
    const originalId = select.id;
    const label = document.querySelector(`label[for="${originalId}"]`);
    const trigger = document.createElement('button');
    trigger.id = `${originalId}-trigger`;
    trigger.type = 'button';
    trigger.className = 'choice-trigger';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', label?.textContent || 'Format de sortie');
    if (select.hasAttribute('aria-describedby')) trigger.setAttribute('aria-describedby',select.getAttribute('aria-describedby'));
    if (label) label.htmlFor = trigger.id;
    const value = document.createElement('span');
    const chevron = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';
    trigger.append(value);
    trigger.insertAdjacentHTML('beforeend', chevron);
    const refresh = () => { value.textContent = select.selectedOptions[0]?.textContent || ''; };
    refresh();
    select.after(trigger);
    select.hidden = true;
    let menu = null;
    let active = 0;
    let search = '';
    let searchedAt = 0;
    const close = () => {
      menu?.remove(); menu = null;
      trigger.setAttribute('aria-expanded','false');
      trigger.removeAttribute('aria-controls');
      trigger.removeAttribute('aria-activedescendant');
    };
    const highlight = () => {
      menu?.querySelectorAll('[role="option"]').forEach((option,index) => { option.dataset.active=String(index===active); });
      trigger.setAttribute('aria-activedescendant',`${originalId}-option-${active}`);
      menu?.children[active]?.scrollIntoView({block:'nearest'});
    };
    const choose = index => { select.selectedIndex=index; refresh(); select.dispatchEvent(new Event('change',{bubbles:true})); close(); };
    const open = keyboard => {
      dismiss(); dismiss=close;
      const rect=trigger.getBoundingClientRect();
      const width=Math.min(Math.max(rect.width,220),innerWidth-24);
      menu=document.createElement('div');
      menu.id=`${originalId}-options`;
      menu.className='choice-menu'; menu.setAttribute('role','listbox');
      menu.setAttribute('aria-label',trigger.getAttribute('aria-label'));
      const height=Math.min(260,select.options.length*48+16,Math.max(80,innerHeight-24));
      const top=innerHeight-rect.bottom-12<height && rect.top>height ? rect.top-height-6 : rect.bottom+6;
      Object.assign(menu.style,{left:`${Math.max(12,Math.min(rect.left,innerWidth-width-12))}px`,top:`${top}px`,width:`${width}px`,maxHeight:`${Math.min(height,innerHeight-top-12)}px`});
      if(keyboard) menu.style.animation='none';
      [...select.options].forEach((option,index) => {
        const row=document.createElement('div');
        row.id=`${originalId}-option-${index}`;
        row.setAttribute('role','option'); row.setAttribute('aria-selected',String(index===select.selectedIndex));
        const text=document.createElement('span'); text.textContent=option.textContent; row.append(text);
        row.insertAdjacentHTML('beforeend','<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>');
        row.addEventListener('pointermove',()=>{ active=index; highlight(); });
        row.addEventListener('pointerdown',event=>event.preventDefault());
        row.addEventListener('click',()=>choose(index));
        menu.append(row);
      });
      document.body.append(menu); active=select.selectedIndex;
      trigger.setAttribute('aria-expanded','true'); trigger.setAttribute('aria-controls',menu.id); highlight();
    };
    trigger.addEventListener('click',()=>menu?close():open(false));
    trigger.addEventListener('blur',close);
    select.addEventListener('change',refresh);
    trigger.addEventListener('keydown',event=>{
      if(event.key==='Tab') { close(); return; }
      if(event.key==='Escape'&&menu) { event.preventDefault(); event.stopPropagation(); close(); return; }
      if(['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(event.key)) {
        event.preventDefault();
        if(!menu) { open(true); return; }
        if(event.key==='Enter'||event.key===' ') { choose(active); return; }
        active=event.key==='Home'?0:event.key==='End'?select.options.length-1:(active+(event.key==='ArrowDown'?1:-1)+select.options.length)%select.options.length;
        highlight();
      } else if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey) {
        event.preventDefault(); const now=Date.now(); search=now-searchedAt>600?event.key:search+event.key; searchedAt=now;
        if(!menu) open(true);
        const index=[...select.options].findIndex(option=>option.textContent.toLocaleLowerCase().startsWith(search.toLocaleLowerCase()));
        if(index>=0) { active=index; highlight(); }
      }
    });
    document.addEventListener('pointerdown',event=>{ if(!trigger.contains(event.target)&&!menu?.contains(event.target)) close(); },true);
    document.addEventListener('scroll',event=>{ if(!menu?.contains(event.target)) close(); },{capture:true,passive:true});
    window.addEventListener('resize',close);
  });
})();
