// rider-dashboard.js
// Mobile sidebar drawer – matches Customer Dashboard pattern (vanilla, no jQuery)

(function() {
  'use strict';

  const sidebar = document.getElementById('mobile-sidebar');
  const backdrop = document.getElementById('mobile-backdrop');
  const menuBtn = document.getElementById('mobile-menu-btn');

  // exit if required elements are missing (desktop/tablet simply won't have these interactions)
  if (!sidebar || !backdrop || !menuBtn) return;

  // helper to lock/unlock body scroll
  function lockBodyScroll(lock) {
    if (lock) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }

  function openSidebar() {
    sidebar.classList.remove('-translate-x-full');
    sidebar.classList.add('translate-x-0');
    backdrop.classList.remove('hidden');
    lockBodyScroll(true);
  }

  function closeSidebar() {
    sidebar.classList.add('-translate-x-full');
    sidebar.classList.remove('translate-x-0');
    backdrop.classList.add('hidden');
    lockBodyScroll(false);
  }

  // toggle function for menu button
  function toggleSidebar() {
    if (sidebar.classList.contains('-translate-x-full')) {
      openSidebar();
    } else {
      closeSidebar();
    }
  }

  // event listeners
  menuBtn.addEventListener('click', toggleSidebar);
  backdrop.addEventListener('click', closeSidebar);

  // optional: close on escape key (a11y improvement, not required but unobtrusive)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !sidebar.classList.contains('-translate-x-full')) {
      closeSidebar();
    }
  });

  // prevent touchmove on backdrop (to avoid scrolling while sidebar open)
  backdrop.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  backdrop.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });

  // ensure sidebar is hidden on window resize above mobile breakpoint (sm = 640px)
  // this restores original layout if user rotates or resizes
  const mediaQuery = window.matchMedia('(min-width: 640px)');
  function handleScreenChange(e) {
    if (e.matches) {
      // above mobile -> force sidebar visible, no drawer, no backdrop
      sidebar.classList.remove('-translate-x-full', 'translate-x-0');
      sidebar.style.transform = ''; // reset any inline transform
      backdrop.classList.add('hidden');
      lockBodyScroll(false);
    } else {
      // below mobile -> ensure it starts hidden (drawer mode)
      sidebar.classList.add('-translate-x-full');
      sidebar.classList.remove('translate-x-0');
      backdrop.classList.add('hidden');
      lockBodyScroll(false);
    }
  }
  mediaQuery.addListener(handleScreenChange);
  // initial check
  handleScreenChange(mediaQuery);
})();