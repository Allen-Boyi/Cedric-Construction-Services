/**
 * hero-engine.js  —  v3 (DOMParser injection)
 * ─────────────────────────────────────────────────────────────────────────────
 * ROOT-CAUSE FIX (v3):
 *   Previous versions injected the template with  placeholder.innerHTML = html
 *   The browser's HTML parser runs fetched markup through a context-aware
 *   sanitizer when it lands inside a <div>. Because hero-template.html opens
 *   with <link> and <style> tags before the <section>, the parser relocates
 *   those tags and in doing so can silently drop or mis-parent the IDs
 *   inside the <section> — making every getElementById call return null.
 *
 *   v3 replaces innerHTML with DOMParser:
 *     1. DOMParser.parseFromString() creates a FULL isolated document.
 *     2. We query that document for the pieces we need (styles + section).
 *     3. We appendChild() real, already-parsed DOM nodes — no sanitization,
 *        no ID loss, no timing race.
 *     4. layoutHero() runs synchronously right after appendChild() because
 *        appended nodes are immediately queryable.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * CONFIG SHAPE
 * ─────────────────────────────────────────────────────────────────────────────
 * {
 *   tag      : String   — small eyebrow label (optional)
 *   headline : String   — supports <em>...</em> for italic gold accent
 *   sub      : String   — supporting paragraph text
 *   interval : Number   — ms between auto-advances (default 6000)
 *   slides   : [
 *     { type: 'image', src: '...', alt: '...' }
 *     { type: 'video', src: '...', poster: '...' }
 *   ]
 *   buttons  : [
 *     { label, href, variant: 'primary'|'secondary', arrow: true|false, target }
 *   ]
 * }
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function (global) {
  'use strict';

  /* ── Constants ────────────────────────────────────────────────────────────── */
  var DEFAULT_INTERVAL = 6000;
  var TRANSITION_MS    = 400;
  var PAD = function (n) { return String(n).padStart(2, '0'); };

  /* ══════════════════════════════════════════════════════════════════════════
     PUBLIC: loadHero(placeholderId, templatePath, config)
     ─────────────────────────────────────────────────────────────────────────
     1. fetch() the template file
     2. DOMParser.parseFromString() → isolated document (no sanitization)
     3. Transplant <style>/<link> nodes into <head>  (fonts, CSS vars)
     4. appendChild() the <section> into the placeholder
     5. layoutHero(config) synchronously — nodes guaranteed live
  ══════════════════════════════════════════════════════════════════════════ */
  function loadHero(placeholderId, templatePath, config) {

    /* ── Guard: placeholder div ─────────────────────────────────────────── */
    var placeholder = document.getElementById(placeholderId);
    if (!placeholder) {
      console.error(
        '[HeroEngine] loadHero() — no element found with id="' + placeholderId + '".\n' +
        'Add <div id="' + placeholderId + '"></div> to your page.'
      );
      return;
    }

    /* ── Guard: template path ───────────────────────────────────────────── */
    if (!templatePath) {
      console.error('[HeroEngine] loadHero() — templatePath argument is missing.');
      return;
    }

    console.log('[HeroEngine] Fetching template from:', templatePath);

    fetch(templatePath)
      .then(function (response) {
        console.log('[HeroEngine] Fetch response — status:', response.status, response.statusText);

        if (!response.ok) {
          throw new Error(
            'HTTP ' + response.status + ' ' + response.statusText +
            ' — check that "' + templatePath + '" exists on your server.'
          );
        }
        return response.text();
      })

      .then(function (rawHTML) {
        console.log('[HeroEngine] Template fetched — bytes:', rawHTML.length);

        /* ── Step 1: Parse into an isolated document ────────────────────── */
        var parser = new DOMParser();
        var parsed = parser.parseFromString(rawHTML, 'text/html');

        console.log('[HeroEngine] DOMParser result body children:', parsed.body.children.length);

        /* ── Step 2: Transplant <style> and <link> into the live <head> ─── */
        /*
         * This ensures Google Fonts and the CSS design-token <style> block
         * defined in hero-template.html are active in the main document.
         * We skip tags whose href is already loaded (idempotent re-loads).
         */
        var headNodes = Array.from(parsed.head.childNodes);
        headNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;              // skip text/comment nodes
          var tag = node.tagName.toLowerCase();

          if (tag === 'style') {
            var s = document.createElement('style');
            s.textContent = node.textContent;
            document.head.appendChild(s);
            console.log('[HeroEngine] Transplanted <style> block into <head>.');
            return;
          }

          if (tag === 'link') {
            var href = node.getAttribute('href') || '';
            var alreadyLoaded = Array.from(document.head.querySelectorAll('link'))
              .some(function (l) { return l.getAttribute('href') === href; });
            if (!alreadyLoaded) {
              var l = document.createElement('link');
              Array.from(node.attributes).forEach(function (attr) {
                l.setAttribute(attr.name, attr.value);
              });
              document.head.appendChild(l);
              console.log('[HeroEngine] Transplanted <link> into <head>:', href);
            }
          }
        });

        /* ── Step 3: Find the hero <section> in the parsed document ────── */
        var heroSection = parsed.querySelector('.hero-slider-container');

        if (!heroSection) {
          /*
           * Section not found means the wrong file was fetched (e.g. a 404
           * page that returned 200, or the wrong path). Log raw content
           * so you can see exactly what was returned.
           */
          console.error(
            '[HeroEngine] .hero-slider-container not found in parsed template.\n' +
            'First 500 chars of fetched content:\n' +
            rawHTML.slice(0, 500)
          );
          placeholder.innerHTML =
            '<p style="color:red;font-family:sans-serif;padding:2rem">' +
            '[HeroEngine] Template structure error — see console for details.</p>';
          return;
        }

        console.log('[HeroEngine] Found .hero-slider-container — adopting into live DOM.');

        /* ── Step 4: Adopt + append the section into the placeholder ────── */
        /*
         * document.adoptNode() transfers ownership of the node from the
         * DOMParser document to the main document before appending.
         * appendChild() is synchronous — after this line every child node
         * is live and immediately queryable via getElementById / querySelector.
         */
        var liveSection = document.adoptNode(heroSection);
        placeholder.appendChild(liveSection);

        console.log(
          '[HeroEngine] Section appended to #' + placeholderId + '.\n' +
          '  #hero-media-layer found?', !!document.getElementById('hero-media-layer'), '\n' +
          '  #hero-dots found?',        !!document.getElementById('hero-dots')
        );

        /* ── Step 5: Populate — synchronous, no rAF needed ─────────────── */
        layoutHero(config);
      })

      .catch(function (err) {
        console.error('[HeroEngine] loadHero() failed —', err.message);
        placeholder.innerHTML =
          '<p style="color:red;font-family:sans-serif;padding:2rem">' +
          '[HeroEngine] ' + err.message + '</p>';
      });
  }

  /* ══════════════════════════════════════════════════════════════════════════
     PUBLIC: layoutHero(config)
     ─────────────────────────────────────────────────────────────────────────
     Populates the already-injected template with content from config:
       • static text (tag, headline, sub, counter)
       • media slides (images with Ken-Burns + videos)
       • CTA buttons
       • full slider engine (arrows, dots, progress bar, keyboard, touch)
  ══════════════════════════════════════════════════════════════════════════ */
  function layoutHero(config) {

    /* ── Validate config ─────────────────────────────────────────────────── */
    if (!config) {
      console.error('[HeroEngine] layoutHero() requires a config object.');
      return;
    }

    var slides  = (Array.isArray(config.slides) && config.slides.length)
      ? config.slides
      : [{ type: 'image', src: '' }];

    var buttons  = Array.isArray(config.buttons) ? config.buttons : [];
    var interval = (typeof config.interval === 'number' && config.interval > 0)
      ? config.interval
      : DEFAULT_INTERVAL;

    /* ── Grab template nodes ─────────────────────────────────────────────── */
    var mediaLayer    = document.getElementById('hero-media-layer');
    var dotsContainer = document.getElementById('hero-dots');
    var btnContainer  = document.getElementById('hero-buttons-container');
    var tagEl         = document.getElementById('hero-tag-text');
    var headlineEl    = document.getElementById('hero-headline-text');
    var subEl         = document.getElementById('hero-sub-text');
    var currentNumEl  = document.getElementById('hero-current-num');
    var totalNumEl    = document.getElementById('hero-total-num');
    var prevBtn       = document.getElementById('hero-prev-btn');
    var nextBtn       = document.getElementById('hero-next-btn');
    var progressBar   = document.getElementById('hero-progress-bar');

    /* ── Guards ───────────────────────────────────────────────────────────── */
    /*
     * Only #hero-media-layer is critical — without it there is nowhere to
     * put the slides. Everything else (dots, counter, progress bar, arrows)
     * is optional: the engine skips gracefully if an element is absent so
     * that an older/mismatched hero-template.html still renders the slides
     * and buttons rather than showing a blank screen.
     */
    if (!mediaLayer) {
      console.error(
        '[HeroEngine] #hero-media-layer not found — cannot render slides.\n' +
        'Your hero-template.html is missing <div id="hero-media-layer"> inside\n' +
        '.hero-slider-container. Replace your local copy with the latest version.'
      );
      return;
    }

    if (!dotsContainer) {
      console.warn(
        '[HeroEngine] #hero-dots not found — dot indicators disabled.\n' +
        'Your local hero-template.html is an older version without that element.\n' +
        'Download the latest hero-template.html to restore dot navigation.'
      );
    }

    /* ════════════════════════════════════════════════════════════════════════
       1. STATIC TEXT
    ════════════════════════════════════════════════════════════════════════ */
    if (tagEl) {
      if (config.tag) {
        tagEl.textContent   = config.tag;
        tagEl.style.display = '';
      } else {
        tagEl.style.display = 'none';
      }
    }

    if (headlineEl) headlineEl.innerHTML   = config.headline || '';
    if (subEl)      subEl.textContent      = config.sub      || '';
    if (totalNumEl) totalNumEl.textContent = PAD(slides.length);

    /* ════════════════════════════════════════════════════════════════════════
       2. BUILD MEDIA SLIDES
    ════════════════════════════════════════════════════════════════════════ */
    mediaLayer.innerHTML = '';

    slides.forEach(function (slideData, i) {
      var slideEl       = document.createElement('div');
      slideEl.className = 'hero-slide' + (i === 0 ? ' is-active' : '');
      slideEl.setAttribute('role', 'img');
      slideEl.setAttribute('aria-label', 'Slide ' + (i + 1));

      if (slideData.type === 'video') {
        var video         = document.createElement('video');
        video.className   = 'hero-slide__video';
        video.src         = slideData.src    || '';
        video.autoplay    = true;
        video.muted       = true;
        video.loop        = true;
        video.playsInline = true;
        if (slideData.poster) video.poster = slideData.poster;

        video.addEventListener('canplay', function () {
          video.play().catch(function () { /* autoplay policy — silent */ });
        });

        slideEl.appendChild(video);

      } else {
        var img      = document.createElement('img');
        img.className = 'hero-slide__img';
        img.src      = slideData.src  || '';
        img.alt      = slideData.alt  || ('Project image ' + (i + 1));
        img.loading  = i === 0 ? 'eager' : 'lazy';
        img.decoding = 'async';
        slideEl.appendChild(img);
      }

      mediaLayer.appendChild(slideEl);
    });

    /* ════════════════════════════════════════════════════════════════════════
       3. BUILD DOT INDICATORS  (skipped if dotsContainer is absent)
    ════════════════════════════════════════════════════════════════════════ */
    if (dotsContainer) {
      dotsContainer.innerHTML = '';
      slides.forEach(function (_, i) {
        var dot       = document.createElement('button');
        dot.className = 'hero-dot' + (i === 0 ? ' is-active' : '');
        dot.setAttribute('role', 'tab');
        dot.setAttribute('aria-label', 'Go to slide ' + (i + 1));
        dot.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
        dot.addEventListener('click', function () { goTo(i); });
        dotsContainer.appendChild(dot);
      });
    }

    /* ════════════════════════════════════════════════════════════════════════
       4. BUILD CTA BUTTONS
    ════════════════════════════════════════════════════════════════════════ */
    if (btnContainer) {
      btnContainer.innerHTML = '';

      buttons.forEach(function (btnData) {
        var variant   = btnData.variant === 'secondary' ? 'secondary' : 'primary';
        var showArrow = btnData.arrow !== false;

        var a       = document.createElement('a');
        a.className = 'hero-btn hero-btn--' + variant;
        a.href      = btnData.href || '#';
        if (btnData.target) {
          a.target = btnData.target;
          if (btnData.target === '_blank') a.rel = 'noopener noreferrer';
        }

        if (variant === 'primary') {
          var span         = document.createElement('span');
          span.textContent = btnData.label || 'Learn More';
          a.appendChild(span);
        } else {
          a.textContent = btnData.label || 'Learn More';
        }

        if (showArrow) {
          var arrowEl         = document.createElement('span');
          arrowEl.className   = 'hero-btn__arrow';
          arrowEl.textContent = '→';
          arrowEl.setAttribute('aria-hidden', 'true');
          a.appendChild(arrowEl);
        }

        btnContainer.appendChild(a);
      });
    }

    /* ════════════════════════════════════════════════════════════════════════
       5. SLIDER ENGINE
    ════════════════════════════════════════════════════════════════════════ */
    var currentIndex    = 0;
    var isTransitioning = false;
    var timerId         = null;
    var isHovered       = false;

    var allSlides = mediaLayer.querySelectorAll('.hero-slide');
    var allDots   = dotsContainer
      ? dotsContainer.querySelectorAll('.hero-dot')
      : [];   /* empty array — dots simply won't update if container is absent */

    function activate(newIndex) {
      var prevIndex = currentIndex;
      currentIndex  = newIndex;

      allSlides[prevIndex].classList.remove('is-active');
      allSlides[newIndex].classList.add('is-active');

      var incomingVideo = allSlides[newIndex].querySelector('video');
      if (incomingVideo) { incomingVideo.currentTime = 0; incomingVideo.play().catch(function(){}); }
      var outgoingVideo = allSlides[prevIndex].querySelector('video');
      if (outgoingVideo) outgoingVideo.pause();

      allDots[prevIndex].classList.remove('is-active');
      allDots[prevIndex].setAttribute('aria-selected', 'false');
      allDots[newIndex].classList.add('is-active');
      allDots[newIndex].setAttribute('aria-selected', 'true');

      if (currentNumEl) currentNumEl.textContent = PAD(newIndex + 1);
    }

    function goTo(newIndex) {
      if (isTransitioning || newIndex === currentIndex) return;
      isTransitioning = true;
      resetProgress();
      activate(newIndex);
      setTimeout(function () {
        isTransitioning = false;
        if (!isHovered) startProgress();
      }, TRANSITION_MS);
    }

    function next() { goTo((currentIndex + 1) % slides.length); }
    function prev() { goTo((currentIndex - 1 + slides.length) % slides.length); }

    function startProgress() {
      if (slides.length <= 1 || !progressBar) return;
      resetProgress();
      void progressBar.offsetWidth;
      progressBar.style.transitionDuration = interval + 'ms';
      progressBar.classList.add('is-running');
      progressBar.style.width = '100%';
      timerId = setTimeout(next, interval);
    }

    function resetProgress() {
      clearTimeout(timerId);
      if (!progressBar) return;
      progressBar.classList.remove('is-running');
      progressBar.style.transitionDuration = '0ms';
      progressBar.style.width = '0%';
    }

    if (prevBtn) prevBtn.addEventListener('click', function () {
      resetProgress(); prev(); if (!isHovered) startProgress();
    });
    if (nextBtn) nextBtn.addEventListener('click', function () {
      resetProgress(); next(); if (!isHovered) startProgress();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft')  { resetProgress(); prev(); if (!isHovered) startProgress(); }
      if (e.key === 'ArrowRight') { resetProgress(); next(); if (!isHovered) startProgress(); }
    });

    var container = mediaLayer.closest('.hero-slider-container');
    if (container) {
      container.addEventListener('mouseenter', function () { isHovered = true;  resetProgress(); });
      container.addEventListener('mouseleave', function () { isHovered = false; startProgress(); });
      container.addEventListener('focusin',    function () { isHovered = true;  resetProgress(); });
      container.addEventListener('focusout',   function () { isHovered = false; startProgress(); });

      var touchStartX = 0, touchStartY = 0;
      container.addEventListener('touchstart', function (e) {
        touchStartX = e.changedTouches[0].clientX;
        touchStartY = e.changedTouches[0].clientY;
      }, { passive: true });
      container.addEventListener('touchend', function (e) {
        var dx = e.changedTouches[0].clientX - touchStartX;
        var dy = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
          resetProgress();
          if (dx < 0) next(); else prev();
          startProgress();
        }
      }, { passive: true });
    }

    /* ── Boot ────────────────────────────────────────────────────────────── */
    startProgress();

    if (slides.length <= 1) {
      if (prevBtn)       prevBtn.style.display       = 'none';
      if (nextBtn)       nextBtn.style.display       = 'none';
      if (dotsContainer) dotsContainer.style.display = 'none';
      if (progressBar)   progressBar.style.display   = 'none';
      var counterEl = document.querySelector('.hero-counter');
      if (counterEl) counterEl.style.display = 'none';
    }

    console.log('[HeroEngine] layoutHero() complete. Slides loaded:', slides.length);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     EXPOSE GLOBALS
  ══════════════════════════════════════════════════════════════════════════ */
  global.HeroEngine  = { load: loadHero, layout: layoutHero };
  global.loadHero    = loadHero;
  global.layoutHero  = layoutHero;

}(window));