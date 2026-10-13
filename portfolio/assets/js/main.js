/* ============================================================
   main.js — progressive enhancement layer
   ------------------------------------------------------------
   Everything here is additive. The document ships fully readable
   and visible; this file only *adds* motion. If GSAP or
   ScrollTrigger fail to arrive from the CDN, an IntersectionObserver
   driver takes over and the page still animates. If this whole file
   fails, the page is simply static — never empty.
   ============================================================ */
(function () {
  'use strict';

  var root = document.documentElement;
  var mqReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var mqCoarse = window.matchMedia ? window.matchMedia('(pointer: coarse)') : null;

  var REDUCE = !!(mqReduce && mqReduce.matches);
  var FINE = !(mqCoarse && mqCoarse.matches);

  var hasGSAP = typeof window.gsap !== 'undefined';
  var hasST = hasGSAP && typeof window.ScrollTrigger !== 'undefined';
  if (hasST) { try { window.gsap.registerPlugin(window.ScrollTrigger); } catch (e) { hasST = false; } }

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };

  /* ---------- boot hand-off ------------------------------------- */
  function endBoot() {
    root.classList.add('boot-done');
    /* drop the layer for good once the fade has finished */
    setTimeout(function () {
      var l = document.getElementById('loader');
      if (l && l.parentNode) l.parentNode.removeChild(l);
    }, 700);
  }
  window.addEventListener('load', function () { setTimeout(endBoot, 200); });
  setTimeout(endBoot, 1150); /* absolute ceiling, ~1.2s */

  /* ---------- 1 · section reveals (stagger, .6s, power3.out) ---- */
  function initReveals() {
    var targets = $$('[data-reveal]');
    if (!targets.length || REDUCE) return;

    root.classList.add('js-anim');

    var revealNow = function (el) {
      el.classList.add('is-in');
      if (hasGSAP) { try { window.gsap.set(el, { clearProps: 'opacity,transform' }); } catch (e) {} }
    };
    var show = function (els) { els.forEach(revealNow); };

    var tween = function (els, delay) {
      els.forEach(function (el) { el.classList.add('is-in'); });
      window.gsap.fromTo(els,
        { opacity: 0, y: 26 },
        {
          opacity: 1, y: 0, duration: 0.6, ease: 'power3.out',
          delay: delay || 0, clearProps: 'opacity,transform',
          /* if ScrollTrigger.refresh() kills the tween mid-flight the inline
             opacity would otherwise strand the element at zero */
          onInterrupt: function () { els.forEach(revealNow); }
        });
    };

    if (hasST) {
      /* one trigger per element rather than ScrollTrigger.batch: a batch
         can skip a group when the page teleports (deep link, nav jump),
         and a skipped group would stay invisible until the backstop ran. */
      var order = new Map();
      targets.forEach(function (el) {
        var p = el.parentElement;
        order.set(p, (order.get(p) || 0) + 1);
        el.dataset.rv = String(Math.min((order.get(p) || 1) - 1, 6));
      });

      targets.forEach(function (el) {
        var delay = (parseInt(el.dataset.rv, 10) || 0) * 0.09;
        window.ScrollTrigger.create({
          trigger: el,
          start: 'top 92%',
          once: true,
          onEnter: function () { tween([el], delay); },
          onEnterBack: function () { revealNow(el); }
        });
      });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          var el = en.target;
          io.unobserve(el);
          var sibs = $$('[data-reveal]', el.parentNode);
          var idx = sibs.indexOf(el);
          el.style.transitionDelay = (Math.min(idx < 0 ? 0 : idx, 6) * 0.09) + 's';
          el.classList.add('is-in');
        });
      }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
      targets.forEach(function (el) { io.observe(el); });
    }

    /* Hard guarantee: whatever the driver, nothing on screen may stay
       invisible. An element must read as fully transparent on two
       consecutive samples and not be inside a live tween, so a reveal
       that is legitimately in flight is never interrupted. */
    (function watchStuck() {
      var armed = new WeakMap();
      function tick() {
        for (var i = 0; i < targets.length; i++) {
          var el = targets[i];
          var r = el.getBoundingClientRect();
          if (r.top >= window.innerHeight * 0.98 || r.bottom <= 0) { armed.delete(el); continue; }
          if (hasGSAP && window.gsap.isTweening && window.gsap.isTweening(el)) { armed.delete(el); continue; }
          if (getComputedStyle(el).opacity === '0') {
            if (armed.get(el)) revealNow(el);
            else armed.set(el, 1);
          } else {
            armed.delete(el);
            if (!el.classList.contains('is-in')) el.classList.add('is-in');
          }
        }
      }
      var timer = 0;
      window.addEventListener('scroll', function () {
        clearTimeout(timer);
        timer = setTimeout(tick, 180);
      }, { passive: true });
      setTimeout(tick, 400);
      var iv = setInterval(tick, 150);
      setTimeout(function () { clearInterval(iv); }, 9000);
    })();

    /* safety net: nothing above the fold may stay invisible */
    window.addEventListener('load', function () {
      setTimeout(function () {
        targets.forEach(function (el) {
          if (el.classList.contains('is-in')) return;
          if (el.getBoundingClientRect().top < window.innerHeight * 1.05) show([el]);
        });
        if (hasST) { try { window.ScrollTrigger.refresh(); } catch (e) {} }
      }, 900);
    });
  }

  /* ---------- 2 · hero decode / scramble ------------------------ */
  var GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/\\<>#*+—';

  function initScramble() {
    var el = $('[data-scramble]');
    if (!el) return;
    var final = el.textContent.trim();
    el.dataset.text = final;

    if (REDUCE) return; /* leave the real name in place */

    /* assistive tech always reads the true name, never the noise */
    var sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = final;
    el.parentNode.insertBefore(sr, el.nextSibling);
    el.setAttribute('aria-hidden', 'true');

    var queue = final.split('').map(function (c, i) {
      return {
        c: c,
        locked: !/[A-Z]/.test(c),      /* the hyphens stay put */
        start: i * 46,                 /* ms, not frames: same duration at 30 or 144fps */
        end: i * 46 + 240 + Math.random() * 260
      };
    });

    var t0 = 0, raf;
    function tick(now) {
      if (!t0) t0 = now;
      var ms = now - t0;
      var out = '';
      var done = 0;
      for (var i = 0; i < queue.length; i++) {
        var q = queue[i];
        if (q.locked || ms >= q.end) { out += q.c; done++; }
        else {
          /* hold the same character count so the line never reflows */
          out += '<span class="ch">' + GLYPHS[(Math.random() * GLYPHS.length) | 0] + '</span>';
        }
      }
      el.innerHTML = out;
      if (done < queue.length) { raf = requestAnimationFrame(tick); }
      else {
        el.textContent = final;
        el.removeAttribute('aria-hidden');
        if (sr.parentNode) sr.parentNode.removeChild(sr);
      }
    }
    /* start after the boot hand-off so it reads as a reveal, not a glitch */
    setTimeout(function () { raf = requestAnimationFrame(tick); }, 480);
  }

  /* ---------- 3 · counting stat numbers ------------------------- */
  function initCounters() {
    var nums = $$('.stat__num[data-count]');
    if (!nums.length) return;

    if (REDUCE) return; /* final value is already in the DOM */

    nums.forEach(function (el) {
      el.dataset.final = el.textContent.trim();
      el.textContent = '0' + (el.dataset.suffix || '');
    });

    var run = function (el) {
      if (el.dataset.counted) return;
      el.dataset.counted = '1';
      var target = parseFloat(el.dataset.count);
      var suffix = el.dataset.suffix || '';
      var dur = 1500, t0 = performance.now();
      function step(now) {
        var p = clamp((now - t0) / dur, 0, 1);
        var e = 1 - Math.pow(1 - p, 3); /* power3.out equivalent */
        el.textContent = Math.round(target * e) + suffix;
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = el.dataset.final;
      }
      requestAnimationFrame(step);
    };

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        /* a fast flick can skip an IO delivery entirely — if the number is
           already above the fold, count it rather than freezing it at zero */
        if (en.isIntersecting || en.boundingClientRect.top < 0) {
          io.unobserve(en.target);
          run(en.target);
        }
      });
    }, { threshold: [0, 0.35, 0.6] });

    nums.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) run(el);
      else io.observe(el);
    });

    /* jump-safety: a hash jump or a hard flick can skip an IO delivery,
       which would otherwise freeze the number at zero forever */
    var timer = 0;
    function sweep() {
      nums.forEach(function (el) {
        if (el.dataset.counted) return;
        if (el.getBoundingClientRect().top < window.innerHeight) {
          try { io.unobserve(el); } catch (e) {}
          run(el);
        }
      });
    }
    window.addEventListener('scroll', function () {
      clearTimeout(timer);
      timer = setTimeout(sweep, 200);
    }, { passive: true });
    setTimeout(sweep, 1400);
  }

  /* ---------- 4 · nav: disclosure, active section, slider ------- */
  function initNav() {
    var list = $('#nav-list');
    var toggle = $('.nav-toggle');
    var ind = $('#nav-ind');
    var links = list ? $$('a', list) : [];
    if (!list) return;

    if (toggle) {
      toggle.addEventListener('click', function () {
        var open = list.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        positionIndicator();
      });
      list.addEventListener('click', function (e) {
        if (e.target.tagName === 'A' && window.innerWidth <= 860) {
          list.classList.remove('is-open');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && list.classList.contains('is-open')) {
          list.classList.remove('is-open');
          toggle.setAttribute('aria-expanded', 'false');
          toggle.focus();
        }
      });
    }

    function positionIndicator() {
      if (!ind || window.innerWidth <= 860) { if (ind) ind.classList.remove('is-on'); return; }
      var active = links.filter(function (a) { return a.getAttribute('aria-current') === 'true'; })[0];
      if (!active) { ind.classList.remove('is-on'); return; }
      ind.classList.add('is-on');
      ind.style.width = active.offsetWidth + 'px';
      ind.style.transform = 'translateX(' + (active.offsetLeft - 0.2 * 0) + 'px)';
    }

    function setActive(id) {
      var hit = null;
      links.forEach(function (a) {
        var on = a.getAttribute('href') === '#' + id;
        if (on) { a.setAttribute('aria-current', 'true'); hit = a; }
        else { a.removeAttribute('aria-current'); }
      });
      if (hit) positionIndicator();
      else if (ind) ind.classList.remove('is-on');
    }

    var ids = links.map(function (a) { return a.getAttribute('href').slice(1); });
    var sections = ids.map(function (i) { return document.getElementById(i); }).filter(Boolean);

    var current = '';
    var spy = new IntersectionObserver(function (entries) {
      /* pick the topmost intersecting section — stable while scrolling */
      var vis = sections.filter(function (s) {
        var r = s.getBoundingClientRect();
        return r.top < window.innerHeight * 0.45 && r.bottom > window.innerHeight * 0.2;
      });
      var next = vis.length ? vis[0].id : current;
      if (next && next !== current) { current = next; setActive(next); }
    }, { rootMargin: '-20% 0px -55% 0px', threshold: [0, 0.15, 0.5] });
    sections.forEach(function (s) { spy.observe(s); });

    positionIndicator();
    window.addEventListener('resize', positionIndicator);
    window.addEventListener('load', function () { setTimeout(positionIndicator, 400); });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { setTimeout(positionIndicator, 60); });
    }
  }

  /* ---------- 5 · magnetic pill buttons ------------------------- */
  function initMagnetic() {
    if (!FINE || REDUCE) return;
    var items = $$('.magnetic');
    if (!items.length) return;

    var RADIUS = 130, PULL = 0.32;
    var state = items.map(function (el) {
      return { el: el, x: 0, y: 0, tx: 0, ty: 0, on: false };
    });
    var mx = window.innerWidth / 2, my = window.innerHeight / 2, queued = false;

    function frame() {
      queued = false;
      var moving = false;
      state.forEach(function (s) {
        var r = s.el.getBoundingClientRect();
        var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        var dx = mx - cx, dy = my - cy;
        var dist = Math.hypot(dx, dy);
        var reach = RADIUS + Math.max(r.width, r.height) / 2;
        if (dist < reach) {
          var f = 1 - dist / reach;
          s.tx = clamp(dx * PULL * f, -18, 18);
          s.ty = clamp(dy * PULL * f, -14, 14);
        } else { s.tx = 0; s.ty = 0; }
        var nx = lerp(s.x, s.tx, 0.18), ny = lerp(s.y, s.ty, 0.18);
        if (Math.abs(nx - s.x) > 0.05 || Math.abs(ny - s.y) > 0.05) moving = true;
        s.x = nx; s.y = ny;
        s.el.style.setProperty('--mag-x', nx.toFixed(2) + 'px');
        s.el.style.setProperty('--mag-y', ny.toFixed(2) + 'px');
      });
      if (moving || state.some(function (s) { return s.x !== 0 || s.y !== 0; })) {
        queued = true; requestAnimationFrame(frame);
      }
    }

    document.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      mx = e.clientX; my = e.clientY;
      if (!queued) { queued = true; requestAnimationFrame(frame); }
    }, { passive: true });

    items.forEach(function (el) {
      el.addEventListener('pointerdown', function () { el.classList.add('is-pressed'); });
      el.addEventListener('pointerup', function () { el.classList.remove('is-pressed'); });
      el.addEventListener('pointerleave', function () { el.classList.remove('is-pressed'); });
      el.addEventListener('blur', function () { el.classList.remove('is-pressed'); });
    });
  }

  /* ---------- 6 · 3D tilt with a rotating dual-tone shadow ------ */
  function initTilt() {
    if (!FINE || REDUCE) return;
    var els = $$('.tilt');
    if (!els.length) return;

    var MAX = 7, SHADOW = 12;

    els.forEach(function (el) {
      var raf = null, t = { rx: 0, ry: 0 };

      function apply(rx, ry, mx, my, sx, sy) {
        el.style.setProperty('--rx', rx.toFixed(2) + 'deg');
        el.style.setProperty('--ry', ry.toFixed(2) + 'deg');
        el.style.setProperty('--mx', mx.toFixed(1) + '%');
        el.style.setProperty('--my', my.toFixed(1) + '%');
        el.style.setProperty('--sx', sx.toFixed(1));
        el.style.setProperty('--sy', sy.toFixed(1));
      }

      el.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'touch') return;
        var r = el.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width;
        var py = (e.clientY - r.top) / r.height;
        /* lean toward the cursor */
        t.ry = (px - 0.5) * 2 * MAX;
        t.rx = -(py - 0.5) * 2 * MAX;
        el.classList.add('is-tilting');
        if (raf) return;
        raf = requestAnimationFrame(function () {
          raf = null;
          /* the light-shadow pair rotates with the tilt: the dark shadow
             runs away from the pointer, the light one follows it */
          apply(t.rx, t.ry, px * 100, py * 100, (px - 0.5) * -SHADOW * 2, (py - 0.5) * -SHADOW * 2);
        });
      });

      el.addEventListener('pointerleave', function () {
        el.classList.remove('is-tilting');
        apply(0, 0, 50, 50, 0, 0);
      });
    });
  }

  /* ---------- 7 · cursor-borne light ---------------------------- */
  function initCursorLight() {
    if (!FINE || REDUCE) return;
    var queued = false, x = 0, y = 0;
    document.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      x = e.clientX; y = e.clientY;
      if (!queued) {
        queued = true;
        requestAnimationFrame(function () {
          queued = false;
          root.style.setProperty('--px', x + 'px');
          root.style.setProperty('--py', y + 'px');
        });
      }
    }, { passive: true });
    root.classList.add('light-on');
  }

  /* ---------- timeline progress thread -------------------------- */
  function initTimeline() {
    var tl = $('#timeline');
    if (!tl) return;
    var queued = false;
    function update() {
      queued = false;
      var r = tl.getBoundingClientRect();
      var p = clamp((window.innerHeight * 0.72 - r.top) / (r.height * 0.82), 0, 1);
      tl.style.setProperty('--tl', (p * 100).toFixed(1));
      $$('.role', tl).forEach(function (role) {
        var rr = role.getBoundingClientRect();
        if (rr.top < window.innerHeight * 0.72) role.classList.add('is-in');
      });
    }
    window.addEventListener('scroll', function () {
      if (!queued) { queued = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  /* ---------- work filters -------------------------------------- */
  var EMPTY_COPY = {
    flutter: {
      kicker: 'Filed under experience, not flagship systems',
      title: 'No flagship system is Flutter-only',
      body: 'Flutter work is real but it sits in the experience column: web and mobile applications ' +
            'shipped in Flutter, React.js and Node.js for enterprise clients between Jun 2023 and ' +
            'Feb 2025. The six systems listed here are flagship platforms, and none of them is a ' +
            'Flutter-only build — the Flutter surface is the ASTRIX EAM mobile companion inside CAFM.'
    },
    net: { kicker: '', title: '', body: '' },
    mern: { kicker: '', title: '', body: '' },
    ai: { kicker: '', title: '', body: '' }
  };

  function initFilters() {
    var chips = $$('.chip[data-filter]');
    var cards = $$('#work-grid .proj');
    var empty = $('#work-empty');
    var status = $('#filter-status');
    if (!chips.length || !cards.length) return;

    function apply(key, chip) {
      var shown = 0;
      cards.forEach(function (card) {
        var cats = (card.dataset.cat || '').split(/\s+/);
        var on = key === 'all' || cats.indexOf(key) > -1;
        card.hidden = !on;
        if (on) {
          shown++;
          /* a card revealed after being filtered out must never stay hidden */
          card.classList.add('is-in');
          if (hasGSAP) { try { window.gsap.set(card, { clearProps: 'opacity,transform' }); } catch (e) {} }
        }
      });

      chips.forEach(function (c) { c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'); });

      var e = EMPTY_COPY[key];
      var none = shown === 0;
      if (empty) {
        empty.classList.toggle('is-on', none);
        if (none && e && e.title) {
          $('#work-empty-kicker').textContent = e.kicker;
          $('#work-empty-title').textContent = e.title;
          $('#work-empty-body').textContent = e.body;
        }
      }
      if (status) {
        status.textContent = none
          ? 'No systems match that filter. ' + (e && e.title ? e.title : '')
          : 'Showing ' + shown + ' of ' + cards.length + ' systems.';
      }
      if (hasST) { try { window.ScrollTrigger.refresh(); } catch (err) {} }
    }

    chips.forEach(function (chip) {
      chip.addEventListener('click', function () { apply(chip.dataset.filter, chip); });
    });
  }

  /* ---------- contact form → mailto: (no backend, no fake send) -- */
  function initForm() {
    var form = $('#contact-form');
    if (!form) return;
    var status = $('#form-status');
    var TO = 'inzamamulhaq9080@gmail.com';

    function setInvalid(fieldId, inputId, on) {
      var f = document.getElementById(fieldId);
      var i = document.getElementById(inputId);
      if (f) f.dataset.invalid = on ? 'true' : 'false';
      if (i) i.setAttribute('aria-invalid', on ? 'true' : 'false');
    }

    function valid() {
      var name = $('#cf-name').value.trim();
      var email = $('#cf-email').value.trim();
      var msg = $('#cf-message').value.trim();
      var okEmail = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email);
      setInvalid('f-name', 'cf-name', !name);
      setInvalid('f-email', 'cf-email', !okEmail);
      setInvalid('f-message', 'cf-message', !msg);
      var firstBad = !name ? $('#cf-name') : (!okEmail ? $('#cf-email') : (!msg ? $('#cf-message') : null));
      return { ok: !firstBad, firstBad: firstBad, name: name, email: email, msg: msg };
    }

    $$('#cf-name, #cf-email, #cf-message').forEach(function (el) {
      el.addEventListener('input', function () {
        var wrap = el.closest('.field');
        if (wrap && wrap.dataset.invalid === 'true') valid();
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var r = valid();
      if (!r.ok) {
        status.setAttribute('data-tone', 'err');
        status.textContent = 'Three fields are needed before a draft can be composed.';
        if (r.firstBad) r.firstBad.focus();
        return;
      }
      var subject = ($('#cf-subject').value || '').trim() || 'Project enquiry — via softmachine portfolio';
      var body = r.msg + '\n\n—\n' + r.name + '\n' + r.email;
      var href = 'mailto:' + TO +
        '?subject=' + encodeURIComponent(subject) +
        '&body=' + encodeURIComponent(body);

      status.setAttribute('data-tone', 'ok');
      status.innerHTML = 'Handing the draft to your mail client. Nothing was sent from this page — ' +
        'there is no backend. If your mail app did not open, <a href="' + href + '">open the draft manually</a> ' +
        'or write to <a href="mailto:' + TO + '">' + TO + '</a>.';

      /* the honest action: compose and hand off, never a fake success tick */
      try { window.location.href = href; } catch (err) {}
      status.focus && status.focus();
    });
  }

  /* ---------- deep link ----------------------------------------- */
  /* The browser's native fragment scroll runs before webfonts and the
     boot hand-off have settled, so it can land near the top. Re-apply it
     once layout is final — unless the visitor has already taken over. */
  function initDeepLink() {
    var raw = location.hash;
    if (!raw || raw.length < 2) return;
    var el = document.getElementById(raw.slice(1));
    if (!el) return;

    var touched = false;
    var mark = function () { touched = true; };
    ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(function (k) {
      window.addEventListener(k, mark, { passive: true, capture: true });
    });

    function go() {
      if (touched) return;
      var sm = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
      var top = el.getBoundingClientRect().top + window.scrollY - sm;
      if (Math.abs(window.scrollY - top) < 2) return;
      window.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
    }

    go();
    window.addEventListener('load', function () { setTimeout(go, 160); });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { setTimeout(go, 140); });
    }
  }

  /* ---------- misc ---------------------------------------------- */
  function initMisc() {
    var top = $('#to-top');
    if (top) {
      top.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: REDUCE ? 'auto' : 'smooth' });
        var h = $('.hero-name');
        if (h) { var t = h.closest('a') || h; t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true }); }
      });
    }
  }

  /* ---------- boot ------------------------------------------------ */
  function boot() {
    initReveals();
    initScramble();
    initCounters();
    initNav();
    initMagnetic();
    initTilt();
    initCursorLight();
    initTimeline();
    initFilters();
    initForm();
    initMisc();
    initDeepLink();

    /* keep ScrollTrigger honest once webfonts stop shifting the layout */
    if (hasST && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        setTimeout(function () { try { window.ScrollTrigger.refresh(); } catch (e) {} }, 120);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }

  /* react if the user flips their motion preference mid-session */
  if (mqReduce && mqReduce.addEventListener) {
    mqReduce.addEventListener('change', function (e) {
      if (e.matches) root.classList.remove('js-anim', 'light-on');
    });
  }
})();
