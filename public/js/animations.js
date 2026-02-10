/**
 * Scroll-triggered reveal animations and hero entrance.
 * Uses Intersection Observer to add .reveal-in when sections enter view.
 */

(function () {
  'use strict';

  var ROOT_MARGIN = '0px 0px -80px 0px'; // trigger when 80px from bottom of viewport
  var THRESHOLD = 0.1;

  // Header: add shadow when scrolled
  function initHeaderScroll() {
    var header = document.querySelector('.site-header');
    if (!header) return;
    function update() {
      header.classList.toggle('scrolled', window.scrollY > 20);
    }
    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  // Hero: animate on load (no scroll)
  function initHero() {
    var hero = document.querySelector('.hero.reveal');
    if (hero) {
      requestAnimationFrame(function () {
        hero.classList.add('reveal-in');
      });
    }
  }

  // Mobile nav: hamburger toggle and close on link click
  function initMobileNav() {
    var header = document.querySelector('.site-header');
    var toggle = document.getElementById('nav-toggle');
    var nav = document.getElementById('nav-menu');
    if (!header || !toggle || !nav) return;

    function open() {
      header.classList.add('nav-open');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Close menu');
    }

    function close() {
      header.classList.remove('nav-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open menu');
    }

    toggle.addEventListener('click', function () {
      if (header.classList.contains('nav-open')) {
        close();
      } else {
        open();
      }
    });

    nav.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.addEventListener('click', function () {
        close();
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && header.classList.contains('nav-open')) {
        close();
      }
    });
  }

  // Sections: add .reveal-in when they enter view
  function initScrollReveal() {
    var sections = document.querySelectorAll('.features.reveal, .how.reveal, .cta.reveal');
    if (!sections.length) return;

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('reveal-in');
          }
        });
      },
      { rootMargin: ROOT_MARGIN, threshold: THRESHOLD }
    );

    sections.forEach(function (section) {
      observer.observe(section);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initHeaderScroll();
      initMobileNav();
      initHero();
      initScrollReveal();
    });
  } else {
    initHeaderScroll();
    initMobileNav();
    initHero();
    initScrollReveal();
  }
})();
