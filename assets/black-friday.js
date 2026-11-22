(() => {
  const root = document.documentElement;
  if (!root.hasAttribute('data-black-friday-end')) return;

  const start = Number(root.dataset.blackFridayStart) * 1000;
  const end = Number(root.dataset.blackFridayEnd) * 1000;
  let timeout;

  function update() {
    clearTimeout(timeout);
    const now = Date.now();
    const active = now >= start && now < end;
    const remaining = Math.ceil(((active ? end : start) - now) / 1000);
    const showCountdown = remaining > 0;
    root.toggleAttribute('data-black-friday-active', active);

    const announcement = document.querySelector('[data-black-friday-announcement]');
    const standard = announcement?.parentElement.querySelector('[data-standard-announcement]');
    if (announcement && standard) {
      announcement.hidden = !showCountdown;
      standard.hidden = showCountdown;
      if (showCountdown) {
        const label = announcement.querySelector('[data-black-friday-label]');
        const timer = announcement.querySelector('[data-black-friday-timer]');
        const message = active ? label.dataset.endsIn : label.dataset.startsIn;
        if (label.textContent !== message) label.textContent = message;
        timer.textContent = timer.dataset.format
          .replace('__DAYS__', Math.floor(remaining / 86400))
          .replace('__HOURS__', Math.floor(remaining / 3600) % 24)
          .replace('__MINUTES__', Math.floor(remaining / 60) % 60)
          .replace('__SECONDS__', remaining % 60);
      }
    }

    if (showCountdown && !document.hidden) {
      timeout = setTimeout(update, 1000 - now % 1000);
    }
  }

  document.addEventListener('visibilitychange', update);
  document.addEventListener('shopify:section:load', update);
  window.addEventListener('pageshow', update);
  update();
})();
