/* =============================================================
   Amy Zhu — portfolio site
   Ported from the Claude Design prototype's component logic to
   plain JS (no React, no design-tool runtime). Behaviour follows
   the motion spec M1–M10; touch handling and the responsive wall
   scale are additions the prototype did not need.
   ============================================================= */
(function () {
  'use strict';

  var q = function (s) { return document.querySelector(s); };
  var Q = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  var PROPS = { wallCurve: 10, fishEye: 1, sfxVolume: 50 };
  var CASE_COLOR = { ball: '#ED6A2F', fire: '#C6362B', altay: '#17A98F', dr: '#EFE9DA' };
  var FILTERS = ['ALL', 'ENGINEERING', 'RESEARCH', 'IMPACT', 'CREATIVE'];
  var CASES = ['ball', 'fire', 'altay', 'dr'];
  var TILE = 292, CYCLE = TILE * 4;

  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var coarse = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  var rm = function () { return motionQuery.matches; };

  var view = 'grid';
  var workMode = 'grid';
  var filterIdx = 0;
  var busy = false;
  var soundOn = false;
  var lastHot = null;
  var tileCols = null;

  /* wall lerp state */
  var wx = 0, wy = 0, wyM = 0, txm = 0, tym = 0, tyScroll = 0, flick = 0;
  var scrollTargets = new Map();

  /* ---------- hover shim -------------------------------------
     The prototype expressed hover states as a style-hover attribute.
     Apply them per-property so JS-driven inline styles (filter
     opacity, active states) survive a hover in and out. */
  function bindHover(el) {
    if (el._hoverBound) return;
    el._hoverBound = true;
    var decls = el.getAttribute('style-hover').split(';').filter(Boolean).map(function (d) {
      var i = d.indexOf(':');
      return [d.slice(0, i).trim(), d.slice(i + 1).trim()];
    });
    /* Wall tiles have their transform rewritten every frame by the cylinder
       maths, so an inline hover transform here would be stomped a frame later
       and make the tile twitch under the cursor. Hand the scale to the loop
       instead and let it compose the two. */
    if (el.closest('[data-wallcol]')) {
      decls = decls.filter(function (d) {
        if (d[0] !== 'transform') return true;
        var m = /scale\(\s*([\d.]+)\s*\)/.exec(d[1]);
        el._hoverScale = m ? parseFloat(m[1]) : 1;
        return false;
      });
      el.addEventListener('mouseenter', function () { el._hovered = true; });
      el.addEventListener('mouseleave', function () { el._hovered = false; });
    }
    var prev = {};
    el.addEventListener('mouseenter', function () {
      decls.forEach(function (d) {
        prev[d[0]] = el.style.getPropertyValue(d[0]);
        el.style.setProperty(d[0], d[1]);
      });
    });
    el.addEventListener('mouseleave', function () {
      decls.forEach(function (d) {
        if (prev[d[0]]) el.style.setProperty(d[0], prev[d[0]]);
        else el.style.removeProperty(d[0]);
      });
    });
  }

  /* ---------- clocks (M9) ------------------------------------ */
  function fmt(tz) {
    try {
      return new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz
      }).format(new Date());
    } catch (e) { return '--:--'; }
  }
  function tick() {
    Q('[data-clock="bj"]').forEach(function (el) { el.textContent = fmt('Asia/Shanghai'); });
    Q('[data-clock="bos"]').forEach(function (el) { el.textContent = fmt('America/New_York'); });
  }

  /* ---------- wall ------------------------------------------- */
  function applyCurve() {
    var k = PROPS.wallCurve;
    Q('[data-wallcol]').forEach(function (el) {
      var o = parseFloat(el.getAttribute('data-wallcol'));
      el.style.transform = 'rotateY(' + (-o * k).toFixed(2) + 'deg) translateY(' +
        (-(o * o) * k * 1.05).toFixed(1) + 'px) translateZ(' + (Math.abs(o) * k * 2).toFixed(1) + 'px)';
    });
  }

  var wallScale = 1;
  function fitWall() {
    wallScale = Math.max(0.42, Math.min(1, window.innerWidth / 1180));
    document.documentElement.style.setProperty('--wall-scale', wallScale.toFixed(3));
  }

  /* The wall fakes infinite scroll by repeating its tiles: the rendered offset
     is always wrapped into [-CYCLE, 0), so the run has to be long enough to
     cover the viewport from one cycle above the top down to the bottom. On a
     scaled-down wall the viewport is taller in wall space (vh / scale), and on
     a tall window it is taller still — so the copy count is computed, not fixed
     at three, or the top of the screen scrolls into empty space. */
  var bindNewHovers = false;
  function ensureWallCoverage() {
    fitWall();
    var needed = Math.max(3, Math.ceil((window.innerHeight / wallScale + CYCLE) / CYCLE) + 1);
    var grew = false;
    Q('[data-wallcol]').forEach(function (col) {
      if (!col._originals) {
        col._originals = Array.prototype.slice.call(col.children);
        col._copies = 1;
      }
      while (col._copies < needed) {
        col._originals.forEach(function (k) {
          var clone = k.cloneNode(true);
          clone.setAttribute('aria-hidden', 'true');
          Array.prototype.slice.call(clone.querySelectorAll('button, [tabindex]'))
            .forEach(function (b) { b.setAttribute('tabindex', '-1'); });
          col.appendChild(clone);
        });
        col._copies++;
        grew = true;
        bindNewHovers = true;
      }
    });
    if (grew) tileCols = null;   /* drop the cached child lists */
    if (bindNewHovers) {
      bindNewHovers = false;
      /* cloneNode doesn't copy listeners — without this, hover works on the
         original tiles and does nothing on the copies */
      Q('[style-hover]').forEach(bindHover);
    }
  }

  /* ---------- view switching --------------------------------- */
  function show(target, instant) {
    Q('[data-view]').forEach(function (el) {
      el.style.display = el.getAttribute('data-view') === target ? 'block' : 'none';
    });
    view = target;
    var short = target.replace('case-', '');
    try {
      history.replaceState(null, '', '#' + (target === 'grid' ? 'work' : short));
    } catch (e) { /* file:// */ }

    var hdr = q('[data-header]');
    var light = !!q('[data-view="' + target + '"][data-case-light]');
    if (hdr) hdr.style.filter = light ? 'invert(1)' : 'none';

    var isWork = target === 'grid' || target === 'list';
    var vt = q('[data-viewtoggle]'), fb = q('[data-filter]');
    if (vt) vt.style.display = isWork ? 'flex' : 'none';
    if (fb) fb.style.display = isWork ? 'block' : 'none';

    syncModeBtns();
    placeNavInd(!instant);

    if (!instant && !rm()) {
      Q('[data-view="' + target + '"] [data-case-title], [data-view="' + target + '"] [data-rise]')
        .forEach(function (el) {
          el.animate(
            [{ transform: 'translateY(60px)', opacity: 0 }, { transform: 'none', opacity: 1 }],
            { duration: 750, easing: 'cubic-bezier(0.16,1,0.3,1)', delay: 120, fill: 'backwards' }
          );
        });
    }

    var sc = q('[data-view="' + target + '"] [data-scroll]');
    if (sc) { sc.scrollTop = 0; scrollTargets.delete(sc); }
  }

  function wipeTo(target, color) {
    if (busy) return;
    if (rm()) { show(target, true); return; }
    busy = true;
    sfxWipe();
    var w = q('[data-wipe]');
    w.style.background = color;
    w.style.transition = 'transform 0.55s cubic-bezier(0.83,0,0.17,1)';
    w.style.transform = 'translateY(0%)';
    setTimeout(function () {
      show(target);
      w.style.transform = 'translateY(-103%)';
      setTimeout(function () {
        w.style.transition = 'none';
        w.style.transform = 'translateY(103%)';
        busy = false;
      }, 580);
    }, 580);
  }

  function openCase(id) { wipeTo('case-' + id, CASE_COLOR[id] || '#111'); }

  function goTo(dest) {
    if (dest === 'work') wipeTo(workMode || 'grid', '#0A0A0A');
    else wipeTo(dest, '#0A0A0A');
  }

  function setWorkMode(mode) {
    workMode = mode;
    if (view === mode) return;
    if ((view === 'grid' || view === 'list') && !rm()) {
      var from = q('[data-view="' + view + '"]');
      if (from) {
        from.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-out' });
        setTimeout(function () {
          show(mode);
          var to = q('[data-view="' + mode + '"]');
          if (to) to.animate(
            [{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'none' }],
            { duration: 480, easing: 'cubic-bezier(0.16,1,0.3,1)' }
          );
        }, 240);
        return;
      }
    }
    show(mode, true);
  }

  function syncModeBtns() {
    var active = view === 'list' ? 'list' : 'grid';
    Q('[data-mode-btn]').forEach(function (b) {
      var on = b.getAttribute('data-mode-btn') === active && (view === 'grid' || view === 'list');
      b.style.background = on ? '#FFF' : 'transparent';
      b.style.color = on ? '#111' : '#DDD';
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function placeNavInd(animate) {
    var ind = q('[data-navind]');
    if (!ind) return;
    var key = (view.indexOf('case') === 0 || view === 'grid' || view === 'list') ? 'work' : view;
    var btn = q('[data-navbar] [data-nav-btn="' + key + '"]');
    if (!btn) return;
    if (!animate) ind.style.transition = 'none';
    ind.style.left = btn.offsetLeft + 'px';
    ind.style.width = btn.offsetWidth + 'px';
    if (!animate) requestAnimationFrame(function () {
      ind.style.transition = 'left 0.45s cubic-bezier(0.16,1,0.3,1),width 0.45s cubic-bezier(0.16,1,0.3,1)';
    });
    Q('[data-navbar] [data-nav-btn]').forEach(function (b) {
      b.style.color = b === btn ? '#0A0A0A' : '#E0E0E0';
    });
  }

  function cycleFilter() {
    filterIdx = (filterIdx + 1) % FILTERS.length;
    var f = FILTERS[filterIdx];
    var fb = q('[data-filter]');
    if (fb) fb.textContent = f === 'ALL' ? 'Filter' : 'Filter: ' + f;
    Q('[data-cat]').forEach(function (el) {
      el.style.opacity = (f === 'ALL' || el.getAttribute('data-cat') === f) ? '1' : '0.18';
    });
  }

  function setAboutMode(mode) {
    Q('[data-abpane]').forEach(function (p) {
      var on = p.getAttribute('data-abpane') === mode;
      p.style.display = on ? 'flex' : 'none';
      if (on && !rm()) p.animate(
        [{ opacity: 0, transform: 'translateY(20px)' }, { opacity: 1, transform: 'none' }],
        { duration: 450, easing: 'cubic-bezier(0.16,1,0.3,1)' }
      );
    });
    Q('[data-abmode]').forEach(function (b) {
      var on = b.getAttribute('data-abmode') === mode;
      b.style.background = on ? '#FFF' : 'transparent';
      b.style.color = on ? '#0A0A0A' : '#E0E0E0';
      b.style.fontWeight = on ? '500' : '400';
    });
  }

  /* ---------- synthesized SFX (WebAudio, no assets) (M10) ----- */
  var ctx = null, bus = null;
  function audio() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      bus = ctx.createGain();
      bus.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    bus.gain.value = PROPS.sfxVolume / 100 * 0.5;
    return ctx;
  }
  function env(dur, peak) {
    var c = audio();
    if (!c) return null;
    var g = c.createGain(), t = c.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(bus);
    return { c: c, g: g, t: t };
  }
  function tone(freq, dur, type, peak, slideTo) {
    if (!soundOn) return;
    var e = env(dur, peak);
    if (!e) return;
    var o = e.c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, e.t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, e.t + dur * 0.9);
    o.connect(e.g); o.start(e.t); o.stop(e.t + dur + 0.05);
  }
  function noise(dur, peak, from, to) {
    if (!soundOn) return;
    var e = env(dur, peak);
    if (!e) return;
    var len = Math.floor(e.c.sampleRate * dur);
    var buf = e.c.createBuffer(1, len, e.c.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = e.c.createBufferSource(); src.buffer = buf;
    var f = e.c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.9;
    f.frequency.setValueAtTime(from, e.t);
    f.frequency.exponentialRampToValueAtTime(to, e.t + dur);
    src.connect(f); f.connect(e.g); src.start(e.t);
  }
  var lastHov = 0;
  function sfxHover() {
    var n = performance.now();
    if (n - lastHov < 90) return;
    lastHov = n;
    tone(1150, 0.045, 'sine', 0.10);
  }
  function sfxClick() { tone(660, 0.07, 'triangle', 0.22, 440); }
  function sfxWipe()  { noise(0.55, 0.30, 260, 2400); tone(180, 0.5, 'sine', 0.12, 70); }
  function sfxMorph() { noise(0.32, 0.18, 1800, 500); tone(520, 0.16, 'triangle', 0.12, 780); }
  function sfxBlip()  { tone(880, 0.06, 'square', 0.10, 990); }

  function toggleSound() {
    soundOn = !soundOn;
    var lbl = q('[data-sound-label]'), m = q('[data-sound-meter]');
    if (lbl) lbl.textContent = soundOn ? 'SOUND [ON]' : 'SOUND [OFF]';
    if (m) {
      m.style.backgroundImage = soundOn
        ? 'radial-gradient(#FFFFFF 0.9px,transparent 1px)'
        : 'radial-gradient(#8B8B8B 0.8px,transparent 0.9px)';
      m.style.animation = soundOn && !rm() ? 'sndshift 0.9s linear infinite' : 'none';
    }
    var btn = q('[data-sound]');
    if (btn) btn.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
    if (soundOn) {
      audio();
      tone(440, 0.09, 'sine', 0.2);
      setTimeout(function () { tone(660, 0.09, 'sine', 0.2); }, 90);
      setTimeout(function () { tone(880, 0.14, 'sine', 0.2); }, 180);
    } else {
      soundOn = true; tone(660, 0.08, 'sine', 0.16);
      setTimeout(function () { soundOn = true; tone(330, 0.12, 'sine', 0.16); soundOn = false; }, 90);
      soundOn = false;
    }
  }

  /* ---------- boot -------------------------------------------- */
  function init() {
    ensureWallCoverage();
    Q('[style-hover]').forEach(bindHover);
    applyCurve();

    tick();
    setInterval(tick, 1000);

    /* pointer parallax + cursor pill (M2, M4) */
    if (!coarse) {
      window.addEventListener('mousemove', function (e) {
        var nx = e.clientX / window.innerWidth - 0.5;
        var ny = e.clientY / window.innerHeight - 0.5;
        txm = -nx * 28; tym = -ny * 20;
        var cur = q('[data-cursor]');
        if (cur && cur.style.display !== 'none') {
          cur.style.left = e.clientX + 'px';
          cur.style.top = (e.clientY + 22) + 'px';
        }
      });

      window.addEventListener('wheel', function (e) {
        if (view === 'grid') { e.preventDefault(); tyScroll -= e.deltaY * 0.5; return; }
        var scroller = q('[data-view="' + view + '"] [data-scroll]');
        if (!scroller) return;
        e.preventDefault();
        var max = scroller.scrollHeight - scroller.clientHeight;
        var t = scrollTargets.get(scroller);
        if (t === undefined) t = scroller.scrollTop;
        t = Math.max(0, Math.min(max, t + e.deltaY));
        scrollTargets.set(scroller, t);
      }, { passive: false });

      document.addEventListener('mouseover', function (e) {
        var cur = q('[data-cursor]');
        if (!cur) return;
        var hot = e.target.closest('[data-open], [data-nav-btn], [data-mode-btn], [data-abmode], [data-filter]');
        cur.style.display =
          e.target.closest('[data-open]') && (view === 'grid' || view === 'list') ? 'block' : 'none';
        if (hot && hot !== lastHot) { lastHot = hot; sfxHover(); }
        if (!hot) lastHot = null;
      });
    }

    /* touch: drag the wall in grid view, native scrolling elsewhere */
    var touchY = null, touchT = 0;
    window.addEventListener('touchstart', function (e) {
      if (view !== 'grid') return;
      touchY = e.touches[0].clientY;
      touchT = e.timeStamp;
      flick = 0;
    }, { passive: true });
    window.addEventListener('touchmove', function (e) {
      if (view !== 'grid' || touchY === null) return;
      var y = e.touches[0].clientY;
      var dy = y - touchY;
      var dt = Math.max(1, e.timeStamp - touchT);
      flick = dy / dt * 14;
      tyScroll += dy;
      touchY = y; touchT = e.timeStamp;
      e.preventDefault();
    }, { passive: false });
    window.addEventListener('touchend', function () { touchY = null; }, { passive: true });

    /* clicks */
    document.addEventListener('click', function (e) {
      var open = e.target.closest('[data-open]');
      if (open) { sfxClick(); openCase(open.getAttribute('data-open')); return; }
      var nav = e.target.closest('[data-nav-btn]');
      if (nav) { sfxClick(); goTo(nav.getAttribute('data-nav-btn')); return; }
      var mode = e.target.closest('[data-mode-btn]');
      if (mode) { sfxMorph(); setWorkMode(mode.getAttribute('data-mode-btn')); return; }
      if (e.target.closest('[data-sound]')) { toggleSound(); return; }
      if (e.target.closest('[data-filter]')) { sfxBlip(); cycleFilter(); return; }
      var ab = e.target.closest('[data-abmode]');
      if (ab) { sfxBlip(); setAboutMode(ab.getAttribute('data-abmode')); return; }
    });

    /* Esc leaves a case study */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && view.indexOf('case-') === 0) goTo('work');
    });

    window.addEventListener('resize', function () { ensureWallCoverage(); placeNavInd(false); });

    /* rAF loop (M1, M2) */
    (function loop() {
      requestAnimationFrame(loop);
      var still = rm();
      var wall = q('[data-wall]');
      if (wall && view === 'grid') {
        if (flick) { tyScroll += flick; flick *= 0.93; if (Math.abs(flick) < 0.2) flick = 0; }
        var tx = still ? 0 : txm;
        wx += (tx - wx) * 0.06;
        /* Scroll and cursor drift are lerped apart. Folding the cursor into the
           scroll position let a few px of mouse movement tip it across the
           wrap boundary below, re-drawing the whole wall as the cursor moved. */
        wy += (tyScroll - wy) * 0.06;
        wyM += ((still ? 0 : tym) - wyM) * 0.06;
        var fe = PROPS.fishEye;
        /* momentum tilt, bounded so flicks can't tumble the wall */
        var lag = Math.max(-70, Math.min(70, wy - tyScroll));
        var rx = still ? 0 : lag * -0.14 * fe;
        var ry = still ? 0 : wx * 0.18 * fe;
        /* The tile run repeats every CYCLE px, so drawing at wy or at
           wy mod CYCLE is identical — but the wrapped offset never lifts the
           run off the top of the screen. Scroll position stays in wy so the
           lerp and the momentum tilt above still see the real distance. */
        var wyR = wy % CYCLE; if (wyR > 0) wyR -= CYCLE;
        wyR += wyM;
        wall.style.transform = 'translate(' + wx.toFixed(2) + 'px,' + wyR.toFixed(2) +
          'px) rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg)';

        /* The vanishing point has to sit at the viewer's eye — i.e. in the
           middle of the VIEWPORT. A percentage resolves against the wall's own
           box instead, and that box is the whole repeating tile run (3500px+
           and it grows with the viewport), so the origin ended up ~900px below
           the screen and slid through the wall as it scrolled. Tiles sit at
           different translateZ, so a misplaced origin magnifies each one about
           a different distance: rows drift apart and snap back as you scroll.
           Anchor it in px, in the wall's coordinates, to the same focus point
           the curve below bends around.

           It is also held still rather than chasing scroll momentum and the
           cursor as the prototype did. Moving the vanishing point re-projects
           every tile by a different amount depending on its depth, so rows
           visibly breathe apart and back together. The wall still tilts and
           drifts with both (rotateX / rotateY / the translate above) — that
           moves it as one rigid object, which is what spec M2 asks for. */
        var vhw = window.innerHeight / wallScale;
        var poY = vhw * 0.42 + 150 - wyR;
        wall.style.perspectiveOrigin = (1032 - wx).toFixed(1) + 'px ' + poY.toFixed(1) + 'px';

        if (!tileCols) tileCols = Q('[data-wallcol]').map(function (col) {
          col.style.transformStyle = 'preserve-3d';
          return Array.prototype.slice.call(col.children);
        });
        var k2 = PROPS.wallCurve, vh = vhw;
        tileCols.forEach(function (kids) {
          for (var i = 0; i < kids.length; i++) {
            var cy = -150 + wyR + (i + 0.5) * TILE;
            if (k2 <= 0) {
              var flatHov = kids[i]._hovered ? (kids[i]._hoverScale || 1) : 1;
              kids[i].style.transform = flatHov !== 1 ? 'scale(' + flatHov + ')' : 'none';
              continue;
            }
            /* true cylindrical arc: tiles chained tangent to a circle of radius R,
               so projected footprints stay contiguous (no text overlap at seams) */
            var R = 24000 / k2;
            var yFlat = Math.max(-0.85 * vh, Math.min(0.85 * vh, cy - vh * 0.42));
            var phi = yFlat / R;
            var hov = kids[i]._hovered ? (kids[i]._hoverScale || 1) : 1;
            kids[i].style.transform =
              'translateY(' + (R * Math.sin(phi) - yFlat).toFixed(1) + 'px) translateZ(' +
              (R * (1 - Math.cos(phi))).toFixed(1) + 'px) rotateX(' + (-phi * 57.29578).toFixed(2) + 'deg)' +
              (hov !== 1 ? ' scale(' + hov + ')' : '');
          }
        });
      }
      scrollTargets.forEach(function (t, el) {
        var d = t - el.scrollTop;
        if (Math.abs(d) > 0.5) el.scrollTop += d * 0.11;
        else scrollTargets.delete(el);
      });
    })();

    setTimeout(function () { placeNavInd(false); }, 60);
    setTimeout(function () { placeNavInd(false); }, 600);

    /* hash routing — also keeps the browser's back/forward buttons working
       for deep links like #ball or #about */
    function routeFromHash(instant) {
      var h = (location.hash || '').replace('#', '');
      var target = CASES.indexOf(h) > -1 ? 'case-' + h
        : (['list', 'about', 'contact'].indexOf(h) > -1 ? h : 'grid');
      if (target === view) return;
      if (target === 'list' || target === 'grid') workMode = target;
      show(target, instant);
    }
    view = null;
    routeFromHash(true);
    window.addEventListener('hashchange', function () { routeFromHash(true); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
