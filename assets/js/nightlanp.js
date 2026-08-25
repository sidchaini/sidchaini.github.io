/* ==========================================================================
   NightLANP animation - playback control
   --------------------------------------------------------------------------
   Production path (no query string):

     * wait until the figure scrolls into view, then add .np-play once
     * after one cycle, add .np-idle so the ambient loop can take over
     * from then on, HOVERING SCRUBS: pointer x across the figure drives the
       timeline, and leaving it glides back to the finished frame
     * focusing the link replays the sequence (keyboards cannot scrub)

   It also mirrors the host page's light/dark theme onto <html> as
   .np-theme-dark / .np-theme-light, because this site toggles dark mode by
   rewriting CSS variables rather than by changing prefers-color-scheme.

   It also MOUNTS the artwork: host pages ship empty placeholders and the
   markup arrives from nightlanp-svg.js, which keeps index.html small and lets
   the artwork be cached as its own file.

   The sequence itself is entirely CSS. This file only decides WHEN to start
   it. If this script never loads, the animation simply never plays and the
   composed first frame is shown - which is a reasonable fallback.

   Debug path (?debug=1):

     transport controls plus a frame-exact scrubber, for comparing specific
     moments against logo.mov. Scrubbing uses the Web Animations API:
     getAnimations({subtree:true}) returns every CSS animation in the SVG, and
     each one's currentTime is measured from the shared timeline origin, so
     writing the same value to all of them lands the whole scene on that
     instant. WAAPI is confined to this path.
   ========================================================================== */

(() => {
  'use strict';

  const STAGE_SELECTOR = '[data-nightlanp]';
  const REPLAY_LOCKOUT = 400; // ms; stops hover jitter retriggering the cycle

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /** Read a time-valued custom property (ms or s) from CSS. */
  function cssTime(el, name, fallback) {
    const raw = getComputedStyle(el).getPropertyValue(name).trim();
    if (raw.endsWith('ms')) return parseFloat(raw);
    if (raw.endsWith('s')) return parseFloat(raw) * 1000;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : fallback;
  }

  /** Read a plain numeric custom property from CSS. */
  function cssNumber(el, name, fallback) {
    const n = parseFloat(getComputedStyle(el).getPropertyValue(name));
    return Number.isFinite(n) ? n : fallback;
  }

  /* ------------------------------------------------------------------ */
  /* Mounting                                                            */
  /* ------------------------------------------------------------------ */

  const LOGO_SELECTOR = '[data-nightlanp-logo]';

  /**
   * Suffix every np-* id and the references that point at them.
   *
   * Two copies of the artwork on one page would otherwise share ids, and every
   * url(#np-reveal-mask) in the later copies would silently resolve to the
   * FIRST copy's elements - so all instances would animate off one mask.
   *
   * Only ids move. The stylesheet hooks on classes precisely so it keeps
   * matching afterwards.
   */
  function namespaceSvg(markup, suffix) {
    if (!suffix) return markup;
    // EVERY id, not just the np-* ones: the artwork also carries obs-*,
    // curve-*, band-* and ray-* ids, and leaving those unsuffixed puts 170-odd
    // duplicates in the document. The leading \s keeps this from matching
    // anything but a standalone id attribute.
    return markup
      .replace(/(\s)id="([^"]+)"/g, (_, sp, id) => sp + 'id="' + id + suffix + '"')
      .replace(/url\(#([^)"]+)\)/g, (_, id) => 'url(#' + id + suffix + ')')
      .replace(/((?:xlink:)?href)="#([^"]+)"/g,
        (_, attr, id) => attr + '="#' + id + suffix + '"')
      .replace(/aria-labelledby="([^"]+)"/g, (_, ids) =>
        'aria-labelledby="'
        + ids.trim().split(/\s+/).map((t) => t + suffix).join(' ')
        + '"');
  }

  /**
   * Put the artwork into its placeholders.
   *
   * Host pages ship an empty <span data-nightlanp>; the markup lives in
   * nightlanp-svg.js so index.html stays small and the artwork caches on its
   * own. A placeholder that already contains an <svg> is left alone, so a page
   * may still inline the markup directly if it prefers.
   */
  function mountAssets() {
    const assets = window.NIGHTLANP_ASSETS;
    if (!assets) return;

    const fill = (selector, markup) => {
      document.querySelectorAll(selector).forEach((host, i) => {
        if (host.querySelector('svg')) return;
        host.innerHTML = namespaceSvg(markup, i === 0 ? '' : '-' + (i + 1));
      });
    };

    fill(STAGE_SELECTOR, assets.svg);
    fill(LOGO_SELECTOR, assets.logo);
  }

  /* ------------------------------------------------------------------ */
  /* Theme                                                               */
  /* ------------------------------------------------------------------ */

  const DARK_CLASS = 'np-theme-dark';
  const LIGHT_CLASS = 'np-theme-light';

  /**
   * Relative luminance of a CSS colour token, or null if unparseable.
   * Theme values in practice are #rgb / #rrggbb / rgb() / rgba().
   */
  function luminance(css) {
    if (!css) return null;
    let r;
    let g;
    let b;
    const hex = css.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
      const h = hex[1];
      if (h.length === 3) {
        r = parseInt(h[0] + h[0], 16);
        g = parseInt(h[1] + h[1], 16);
        b = parseInt(h[2] + h[2], 16);
      } else {
        r = parseInt(h.slice(0, 2), 16);
        g = parseInt(h.slice(2, 4), 16);
        b = parseInt(h.slice(4, 6), 16);
      }
    } else {
      const m = css.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
      if (!m) return null;
      r = +m[1];
      g = +m[2];
      b = +m[3];
    }
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }

  /**
   * The page's EFFECTIVE theme.
   *
   * sidchaini.github.io applies dark mode by writing --background-color onto
   * <html>, and its moon-icon toggle never changes prefers-color-scheme.
   * Reading the actual background therefore tracks the manual toggle, which a
   * media query cannot. Falls back to the media query when no such variable
   * exists, i.e. the standalone harness.
   */
  function detectTheme() {
    const bg = getComputedStyle(document.documentElement)
      .getPropertyValue('--background-color');
    const lum = luminance(bg);
    if (lum !== null) return lum < 0.4 ? 'dark' : 'light';
    return window.matchMedia
      && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  function syncTheme() {
    const dark = detectTheme() === 'dark';
    const root = document.documentElement;
    root.classList.toggle(DARK_CLASS, dark);
    root.classList.toggle(LIGHT_CLASS, !dark);
  }

  function watchTheme() {
    syncTheme();
    // Watch the style attribute ONLY. Watching all attributes would re-fire on
    // the class changes syncTheme itself makes, looping forever.
    new MutationObserver(syncTheme).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style'],
    });
    if (window.matchMedia) {
      window
        .matchMedia('(prefers-color-scheme: dark)')
        .addEventListener('change', syncTheme);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Core playback                                                       */
  /* ------------------------------------------------------------------ */

  function createPlayer(stage, hooks) {
    const duration = cssTime(stage, '--np-cycle', 3120);
    const on = hooks || {};
    let settleTimer = null;
    // -Infinity, not 0: performance.now() is milliseconds since navigation
    // start, so on a fast load the IntersectionObserver can fire at t < 400ms
    // and the lockout below would swallow the very first play.
    let lastStart = -Infinity;

    function start() {
      const now = performance.now();
      if (now - lastStart < REPLAY_LOCKOUT) return;
      lastStart = now;

      clearTimeout(settleTimer);
      if (on.beforeStart) on.beforeStart();

      stage.classList.remove('np-idle');
      stage.classList.add('np-play');

      // Adding the class only flips animation-play-state - it does NOT rewind.
      // The first play looks right purely because everything is already sitting
      // at currentTime 0; without the seek below, every later replay is a
      // silent no-op. Seek explicitly so a replay actually replays.
      animationsIn(stage).forEach((a) => {
        try {
          a.currentTime = 0;
          a.play();
        } catch (_) {
          /* not seekable; skip it */
        }
      });

      settleTimer = setTimeout(() => {
        stage.classList.add('np-idle');
        if (on.afterSettle) on.afterSettle();
      }, duration);
    }

    function showFinalFrame() {
      clearTimeout(settleTimer);
      stage.classList.add('np-play', 'np-idle', 'np-static');
    }

    return { start, showFinalFrame, duration };
  }

  /* ------------------------------------------------------------------ */
  /* Hover scrubbing                                                     */
  /* ------------------------------------------------------------------ */

  // Only where a real hover exists. On touch there is no hover, and turning a
  // drag into a scrub would fight the page's own scrolling.
  const FINE_POINTER = window.matchMedia('(hover: hover) and (pointer: fine)');

  /**
   * After the one-shot has played, pointer position across the figure drives
   * the timeline: left rewinds, right fast-forwards.
   *
   * The target time follows the pointer, and the rendered time eases toward it
   * each frame, so a flicked mouse reads as a scrub rather than a teleport.
   * Leaving the figure glides back to the settled end frame.
   */
  function createScrubber(stage, player) {
    const smooth = cssNumber(stage, '--np-scrub-smooth', 0.2);
    const glideMs = cssTime(stage, '--np-scrub-return', 450);

    let armed = false;    // the one-shot has finished; scrubbing may take over
    let active = false;   // pointer is inside
    let target = player.duration;
    let shown = player.duration;
    let raf = null;
    let glideFrom = 0;
    let glideStart = 0;

    const anims = () => animationsIn(stage);

    function seek(t) {
      anims().forEach((a) => {
        try {
          a.currentTime = t;
        } catch (_) {
          /* not seekable; skip it */
        }
      });
    }

    function pauseAll() {
      anims().forEach((a) => {
        try {
          a.pause();
        } catch (_) {
          /* ignore */
        }
      });
    }

    /**
     * Resume ONLY the endless ambient animations.
     *
     * play() on a FINISHED finite animation rewinds it to 0, so resuming
     * everything here would replay the whole intro each time the pointer left.
     * The finite ones are meant to stay parked at their end state - which is
     * exactly the settled frame.
     */
    function resumeAmbient() {
      anims().forEach((a) => {
        const timing = a.effect && a.effect.getTiming();
        if (timing && timing.iterations === Infinity) {
          try {
            a.play();
          } catch (_) {
            /* ignore */
          }
        }
      });
    }

    function frame() {
      if (active) {
        shown += (target - shown) * smooth;
        if (Math.abs(target - shown) < 0.5) shown = target;
        seek(shown);
        raf = requestAnimationFrame(frame);
        return;
      }

      const p = glideMs > 0
        ? Math.min(1, (performance.now() - glideStart) / glideMs)
        : 1;
      const eased = 1 - Math.pow(1 - p, 3);
      shown = glideFrom + (player.duration - glideFrom) * eased;
      seek(shown);

      if (p < 1) {
        raf = requestAnimationFrame(frame);
      } else {
        raf = null;
        resumeAmbient();
      }
    }

    function onMove(e) {
      if (!armed) return;
      // Map across the ANIMATION's box, not the hover target's: the site's
      // .image anchor carries padding the artwork does not.
      const r = stage.getBoundingClientRect();
      if (!r.width) return;
      const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      target = frac * player.duration;

      if (!active) {
        active = true;
        pauseAll();
      }
      if (raf === null) raf = requestAnimationFrame(frame);
    }

    function onLeave() {
      if (!active) return;
      active = false;
      glideFrom = shown;
      glideStart = performance.now();
      if (raf === null) raf = requestAnimationFrame(frame);
    }

    return {
      arm() {
        armed = true;
      },
      disarm() {
        armed = false;
        active = false;
        if (raf !== null) cancelAnimationFrame(raf);
        raf = null;
        shown = player.duration;
      },
      attach(el) {
        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerleave', onLeave);
      },
    };
  }

  /* ------------------------------------------------------------------ */
  /* Debug transport                                                     */
  /* ------------------------------------------------------------------ */

  function animationsIn(stage) {
    // Includes animations inside <defs>, which is where the reveal mask lives.
    return stage.getAnimations
      ? stage.getAnimations({ subtree: true })
      : [];
  }

  /* Debug styles are injected here rather than living in animation.css, so the
     production stylesheet carries nothing the live site will never render. */
  const DEBUG_CSS = `
    .np-debug {
      font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
      display: flex; flex-direction: column; gap: .5rem;
      padding: .75rem; margin-top: .5rem;
      border: 1px solid #d9d9d9; border-radius: 6px; background: #fff;
      color: #222;
    }
    .np-debug-row { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
    .np-debug button {
      font: inherit; padding: .25rem .6rem; cursor: pointer;
      border: 1px solid #cfcfcf; border-radius: 4px; background: #fafafa;
      color: inherit;
    }
    .np-debug button:hover { background: #f0f0f0; }
    .np-debug button[aria-pressed="true"] {
      background: #222; border-color: #222; color: #fff;
    }
    .np-debug-check { display: inline-flex; align-items: center; gap: .3rem; }
    .np-debug-time { margin-left: auto; font-variant-numeric: tabular-nums; }
    .np-debug-scrub { width: 100%; }
    .np-debug-speeds { gap: .35rem; }
  `;

  function injectDebugStyles() {
    if (document.getElementById('np-debug-style')) return;
    const el = document.createElement('style');
    el.id = 'np-debug-style';
    el.textContent = DEBUG_CSS;
    document.head.appendChild(el);
  }

  function buildDebugUI(stage, player, startAt) {
    injectDebugStyles();
    // np-visible enables the ambient loop so it is scrubbable too.
    stage.classList.add('np-play', 'np-visible');

    const panel = document.createElement('div');
    panel.className = 'np-debug';
    panel.innerHTML = `
      <div class="np-debug-row">
        <button type="button" data-act="play">Play</button>
        <button type="button" data-act="pause">Pause</button>
        <button type="button" data-act="restart">Restart</button>
        <label class="np-debug-check">
          <input type="checkbox" data-act="loop"> Loop
        </label>
        <span class="np-debug-time"><output data-out="time">0</output> ms</span>
      </div>
      <div class="np-debug-row">
        <input class="np-debug-scrub" type="range" data-act="scrub"
               min="0" max="${player.duration}" step="1" value="0">
      </div>
      <div class="np-debug-row np-debug-speeds">
        <span>Speed</span>
        ${[0.25, 0.5, 1, 2]
          .map(
            (r) =>
              `<button type="button" data-act="rate" data-rate="${r}"
                 ${r === 1 ? 'aria-pressed="true"' : 'aria-pressed="false"'}
               >${r}&times;</button>`
          )
          .join('')}
      </div>`;
    // Place the panel after the whole figure, so it does not wedge itself
    // between the animation and the wordmark beneath it.
    const host = stage.closest('.np-figure') || stage;
    host.parentNode.insertBefore(panel, host.nextSibling);

    const scrub = panel.querySelector('[data-act="scrub"]');
    const out = panel.querySelector('[data-out="time"]');
    const loopBox = panel.querySelector('[data-act="loop"]');

    let rate = 1;
    let playing = false;
    let raf = null;

    const anims = () => animationsIn(stage);

    function seek(ms) {
      anims().forEach((a) => {
        try {
          a.currentTime = ms;
        } catch (_) {
          /* an animation may be in an unsupported state; skip it */
        }
      });
      scrub.value = String(Math.round(ms));
      out.textContent = String(Math.round(ms));
    }

    function currentTime() {
      const list = anims();
      let max = 0;
      list.forEach((a) => {
        const t = Number(a.currentTime) || 0;
        if (t > max) max = t;
      });
      return max;
    }

    function tick() {
      if (!playing) return;
      const t = currentTime();
      scrub.value = String(Math.round(Math.min(t, player.duration)));
      out.textContent = String(Math.round(t));

      if (t >= player.duration) {
        if (loopBox.checked) {
          seek(0);
        } else {
          doPause();
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    }

    function doPlay() {
      playing = true;
      anims().forEach((a) => {
        a.playbackRate = rate;
        a.play();
      });
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    }

    function doPause() {
      playing = false;
      cancelAnimationFrame(raf);
      anims().forEach((a) => a.pause());
    }

    panel.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn || btn.tagName !== 'BUTTON') return;

      switch (btn.dataset.act) {
        case 'play':
          doPlay();
          break;
        case 'pause':
          doPause();
          break;
        case 'restart':
          seek(0);
          doPlay();
          break;
        case 'rate':
          rate = parseFloat(btn.dataset.rate);
          panel
            .querySelectorAll('[data-act="rate"]')
            .forEach((b) =>
              b.setAttribute('aria-pressed', String(b === btn))
            );
          anims().forEach((a) => {
            a.playbackRate = rate;
          });
          break;
      }
    });

    scrub.addEventListener('input', () => {
      doPause();
      seek(parseFloat(scrub.value));
    });

    // Start paused on the requested instant (frame 0 unless ?t= says
    // otherwise), so the first thing you see matches the corresponding moment
    // of logo.mov rather than a half-played sequence.
    requestAnimationFrame(() => {
      doPause();
      seek(startAt || 0);
      requestAnimationFrame(() => {
        document.documentElement.dataset.npReady = '1';
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Wiring                                                              */
  /* ------------------------------------------------------------------ */

  /**
   * Park a stage at an exact instant and hold it there.
   *
   * Used by ?t=<ms>, which is how tools/compare.py drives headless Chrome to
   * capture the same moments it extracts from logo.mov. Marks the document
   * ready afterwards so the capture knows the frame has settled.
   */
  function freezeAt(stage, ms) {
    stage.classList.add('np-play');
    requestAnimationFrame(() => {
      animationsIn(stage).forEach((a) => {
        try {
          a.pause();
          a.currentTime = ms;
        } catch (_) {
          /* skip animations that cannot accept a time */
        }
      });
      requestAnimationFrame(() => {
        document.documentElement.dataset.npReady = '1';
      });
    });
  }

  function init() {
    // Markup first - everything below queries elements inside it.
    mountAssets();

    // Then theme: the wordmark colour and the band tints depend on it, and it
    // applies whether or not there is an animation on the page.
    watchTheme();

    const stages = document.querySelectorAll(STAGE_SELECTOR);
    if (!stages.length) return;

    const params = new URLSearchParams(location.search);
    const debug = params.get('debug') === '1';
    const bare = params.get('bare') === '1';
    const seekTo = params.has('t') ? parseFloat(params.get('t')) : null;

    stages.forEach((stage) => {
      let scrubber = null;
      const player = createPlayer(stage, {
        beforeStart: () => scrubber && scrubber.disarm(),
        afterSettle: () => scrubber && scrubber.arm(),
      });

      // ?t= wins over everything, including reduced motion: it exists purely
      // for frame capture, and must render the requested instant verbatim.
      if (seekTo !== null && !Number.isNaN(seekTo)) {
        if (debug && !bare) {
          buildDebugUI(stage, player, seekTo);
        } else {
          freezeAt(stage, seekTo);
        }
        return;
      }

      if (reduceMotion.matches) {
        player.showFinalFrame();
        return;
      }

      if (debug) {
        buildDebugUI(stage, player, 0);
        return;
      }

      if ('IntersectionObserver' in window) {
        let started = false;
        const io = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              // .np-visible gates the ambient loop, and is toggled BOTH ways so
              // an off-screen card stops repainting. The sequence itself still
              // plays only once.
              stage.classList.toggle('np-visible', entry.isIntersecting);
              if (entry.isIntersecting && !started) {
                started = true;
                player.start();
              }
            });
          },
          { threshold: 0.35 }
        );
        io.observe(stage);
      } else {
        stage.classList.add('np-visible');
        player.start();
      }

      // Hovering scrubs rather than replays: once the one-shot has finished,
      // pointer position across the figure drives the timeline. Keyboard users
      // cannot scrub, so focus still triggers a plain replay.
      const figure = stage.closest('.np-figure') || stage;
      const trigger = stage.closest('a') || figure;

      if (FINE_POINTER.matches) {
        scrubber = createScrubber(stage, player);
        scrubber.attach(trigger);
      }
      trigger.addEventListener('focusin', player.start);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
