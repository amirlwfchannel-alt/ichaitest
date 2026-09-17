/* Progressive keyboard support; never reads or writes backend data. */
document.addEventListener('alpine:initialized', () => {
  const panels = [...document.querySelectorAll('[role="dialog"]')];
  const visible = el => !!el && el.getClientRects().length > 0;
  const focusable = el => [...el.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(visible);
  let active = null, priorFocus = null, oldOverflow = '';
  const sync = () => {
    // Success sits above the drawers; last visible modal wins.
    const next = panels.filter(visible).sort((a,b) =>
      Number(a.classList.contains('modal-box')) - Number(b.classList.contains('modal-box'))).pop() || null;
    if (next === active) return;
    if (next) {
      if (!active) { priorFocus = document.activeElement; oldOverflow = document.body.style.overflow; }
      active = next;
      document.body.style.overflow = 'hidden';
      (focusable(active)[0] || active).focus({preventScroll:true});
    } else {
      active = null;
      document.body.style.overflow = oldOverflow;
      if (priorFocus?.isConnected) priorFocus.focus({preventScroll:true});
      priorFocus = null;
    }
  };
  const observer = new MutationObserver(sync);
  for (const panel of panels) {
    observer.observe(panel, {attributes:true,attributeFilter:['style','x-cloak']});
    if (panel.classList.contains('modal-box')) observer.observe(panel.parentElement, {attributes:true,attributeFilter:['style','x-cloak']});
  }
  document.addEventListener('keydown', e => {
    if (!active) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      active.querySelector('[data-dialog-close]')?.click();
    } else if (e.key === 'Tab') {
      const items = focusable(active), first = items[0], last = items[items.length-1];
      if (!first) { e.preventDefault(); active.focus(); }
      else if (e.shiftKey && (document.activeElement === first || !active.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !active.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    }
  });
  document.addEventListener('focusin', e => {
    if (active && !active.contains(e.target)) (focusable(active)[0] || active).focus({preventScroll:true});
  });
  sync();
});
