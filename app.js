(() => {
  const $ = (id) => document.getElementById(id);

  const INITIAL_GREEN = 64;
  const INITIAL_YELLOW = 128;
  const CHANNEL_NAMES = ['R', 'G', 'B'];

  const state = {
    target: [0, 0, 0],
    maxGuesses: 6,
    guesses: [],
    thresholds: [],
    done: false,
    won: false,
  };

  const randInt256 = () => Math.floor(Math.random() * 256);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const MESSAGES = {
    one: [
      "Cheating?",
      "Are you a bot? Bots get banned.",
      "Suspicious. Highly suspicious.",
      "Nobody does that. Nobody.",
      "Lucky guess. Or witchcraft.",
      "One shot, one kill.",
      "I'm calling the referee.",
      "Statistically implausible.",
      "Did you peek at the source?",
      "Hex vision confirmed.",
    ],
    prodigy: [
      "Chromatic prodigy.",
      "Eagle-eyed.",
      "Masterful.",
      "Pantone's secret child?",
      "Prodigious.",
      "Uncanny color sense.",
      "Effortless.",
      "The retina remembers.",
    ],
    solid: [
      "Solidly done.",
      "Nailed it.",
      "Pigment whisperer.",
      "Respectable showing.",
      "Handsomely played.",
      "Smooth.",
      "Tidy work.",
    ],
    scenic: [
      "Got there eventually.",
      "Scenic route, but you arrived.",
      "Patience pays.",
      "A bit meandering, but a win.",
      "Victory, however ragged.",
      "Earned every pixel of that.",
    ],
    tight: [
      "Dramatic finish.",
      "You like living dangerously.",
      "Close one.",
      "Nearly a tragedy.",
      "A whisker from the void.",
    ],
    last: [
      "Phew!",
      "By the skin of your teeth.",
      "Clutch.",
      "On fumes.",
      "Heart attack narrowly avoided.",
      "Graceless — but a win.",
      "The last breath saved you.",
      "Cut it finer next time, will you?",
    ],
    loseAlmost: [
      "Almost!!",
      "Painfully close.",
      "A single pixel away.",
      "Oh, so nearly.",
      "Cruel. Just cruel.",
      "Practically had it.",
      "Within arm's reach.",
      "Could taste it.",
      "Heartbreak hex.",
      "That one will sting for a while.",
    ],
    loseWarm: [
      "Tantalizing.",
      "Warm. Very warm.",
      "Knocking on the door.",
      "The color winked and left.",
      "So near, so far.",
      "Close, but no pigment.",
    ],
    loseClose: [
      "Respectable, but no cigar.",
      "In the neighbourhood.",
      "The palette had other ideas.",
      "Good hunting, wrong quarry.",
      "Circling the right hue.",
    ],
    loseMid: [
      "Somewhere in the ballpark.",
      "You and the color are roughly acquainted.",
      "Middling effort.",
      "A passing familiarity at best.",
      "Chromatically adjacent.",
    ],
    loseFar: [
      "Spectrum mismatch.",
      "A different hue altogether.",
      "The wheel keeps turning.",
      "Noted attempt. Wrong territory.",
      "Cold.",
      "Outfoxed by six little digits.",
    ],
    loseAwful: [
      "Not even close.",
      "Were you trying?",
      "Chromatic amnesia.",
      "Are we looking at the same colors?",
      "Hexual identity crisis.",
      "The void consumed your guess.",
      "Diametrically opposed.",
      "You picked the opposite corner of the cube, friend.",
    ],
  };

  function successMessage(guesses, max) {
    if (guesses === 1) return pick(MESSAGES.one);
    if (guesses === max) return pick(MESSAGES.last);
    if (max >= 4 && guesses === max - 1) return pick(MESSAGES.tight);
    const ratio = guesses / max;
    if (ratio <= 0.34) return pick(MESSAGES.prodigy);
    if (ratio <= 0.67) return pick(MESSAGES.solid);
    return pick(MESSAGES.scenic);
  }

  function bestGuess(guesses, target) {
    let best = null;
    let bestPct = -1;
    guesses.forEach((g, idx) => {
      const pct = nearnessPct(g.rgb, target);
      if (pct > bestPct) {
        bestPct = pct;
        best = { guess: g, pct, idx };
      }
    });
    return best;
  }

  function failMessage(bestPct) {
    if (bestPct >= 95) return pick(MESSAGES.loseAlmost);
    if (bestPct >= 85) return pick(MESSAGES.loseWarm);
    if (bestPct >= 70) return pick(MESSAGES.loseClose);
    if (bestPct >= 50) return pick(MESSAGES.loseMid);
    if (bestPct >= 25) return pick(MESSAGES.loseFar);
    return pick(MESSAGES.loseAwful);
  }

  const rgbToHex = ([r, g, b]) =>
    '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');

  function parseHex(s) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((s || '').trim());
    if (!m) return null;
    let hex = m[1];
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }

  const MAX_DIST = Math.sqrt(3) * 255;

  function possibleRanges({ value: v, result, band }) {
    if (result === 'exact') return [[v, v]];
    if (result === 'green') {
      const g = Math.max(0, Math.floor(band.green));
      return [[Math.max(0, v - g), Math.min(255, v + g)]];
    }
    if (result === 'yellow') {
      const y = Math.max(0, Math.floor(band.yellow));
      return [[Math.max(0, v - y), Math.min(255, v + y)]];
    }
    // red: outside the yellow band at both ends
    const y = Math.max(0, Math.floor(band.yellow));
    const out = [];
    if (v - y - 1 >= 0) out.push([0, v - y - 1]);
    if (v + y + 1 <= 255) out.push([v + y + 1, 255]);
    return out;
  }

  function rangesLabel(ranges) {
    return ranges
      .map(([lo, hi]) => (lo === hi ? `${lo}` : `${lo}–${hi}`))
      .join(' or ');
  }

  function nearnessPct(guess, target) {
    const dr = guess[0] - target[0];
    const dg = guess[1] - target[1];
    const db = guess[2] - target[2];
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    return Math.round((1 - dist / MAX_DIST) * 100);
  }

  function classify(delta, t) {
    if (delta === 0) return 'exact';
    if (delta <= t.green) return 'green';
    if (delta <= t.yellow) return 'yellow';
    return 'red';
  }

  function tightenThreshold(t, result) {
    // exact is strictly better than green; treat it like green for shrinking
    if (result === 'exact' || result === 'green') {
      t.green /= 4;
      t.yellow /= 4;
    } else if (result === 'yellow') {
      t.green /= 2;
      t.yellow /= 2;
    }
  }

  function newGame() {
    state.target = [randInt256(), randInt256(), randInt256()];
    state.maxGuesses = Math.max(1, parseInt($('maxGuesses').value, 10) || 6);
    state.guesses = [];
    state.thresholds = [0, 1, 2].map(() => ({
      green: INITIAL_GREEN,
      yellow: INITIAL_YELLOW,
    }));
    state.done = false;
    state.won = false;
    render();
  }

  function submitGuess() {
    if (state.done) return;
    const rgb = parseHex($('hexInput').value);
    if (!rgb) {
      $('hexInput').classList.add('invalid');
      return;
    }
    $('hexInput').classList.remove('invalid');

    const channels = rgb.map((v, i) => {
      const delta = Math.abs(v - state.target[i]);
      const t = state.thresholds[i];
      const band = { green: t.green, yellow: t.yellow };
      const result = classify(delta, t);
      return { value: v, delta, result, band };
    });

    // Tighten AFTER classification, so subsequent guesses see the shrunken bands.
    channels.forEach((c, i) => tightenThreshold(state.thresholds[i], c.result));

    state.guesses.push({ rgb, channels });

    if (channels.every((c) => c.result === 'exact')) {
      state.done = true;
      state.won = true;
    } else if (state.guesses.length >= state.maxGuesses) {
      state.done = true;
    }
    render();
  }

  function renderBands() {
    const bands = $('bands');
    bands.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'bands-title';
    title.textContent = 'Feedback ranges (|delta| per channel)';
    bands.appendChild(title);

    state.thresholds.forEach((t, i) => {
      const g = Math.max(0, Math.floor(t.green));
      const y = Math.max(0, Math.floor(t.yellow));
      const greenPct = (t.green / 255) * 100;
      const yellowPct = Math.max(0, ((t.yellow - t.green) / 255) * 100);
      const redPct = Math.max(0, 100 - greenPct - yellowPct);

      const row = document.createElement('div');
      row.className = 'band';

      const label = document.createElement('span');
      label.className = 'band-label';
      label.textContent = CHANNEL_NAMES[i];
      row.appendChild(label);

      const bar = document.createElement('div');
      bar.className = 'band-bar';

      const segs = [
        { cls: 'green',  width: greenPct,  text: `≤${g}` },
        { cls: 'yellow', width: yellowPct, text: `≤${y}` },
        { cls: 'red',    width: redPct,    text: `>${y}` },
      ];
      segs.forEach((s) => {
        const seg = document.createElement('span');
        seg.className = `band-seg ${s.cls}`;
        seg.style.width = `${s.width}%`;
        seg.textContent = s.text;
        seg.title = `${s.cls}: ${s.text}`;
        bar.appendChild(seg);
      });
      row.appendChild(bar);
      bands.appendChild(row);
    });
  }

  function render() {
    const swatch = $('targetSwatch');
    if (state.done) {
      swatch.style.background = rgbToHex(state.target);
      swatch.textContent = '';
      swatch.classList.remove('hidden');
    } else {
      swatch.style.background = '';
      swatch.textContent = '?';
      swatch.classList.add('hidden');
    }
    $('guessCount').textContent = state.guesses.length;
    $('maxGuessesLabel').textContent = state.maxGuesses;
    renderBands();

    const history = $('history');
    history.innerHTML = '';
    state.guesses.forEach((g, idx) => {
      const row = document.createElement('div');
      row.className = 'row';

      const sw = document.createElement('div');
      sw.className = 'swatch small';
      sw.style.background = rgbToHex(g.rgb);
      row.appendChild(sw);

      const num = document.createElement('span');
      num.className = 'hex';
      num.textContent = `#${idx + 1} ${rgbToHex(g.rgb)}`;
      row.appendChild(num);

      const channels = document.createElement('div');
      channels.className = 'channels';
      g.channels.forEach((c, i) => {
        const letter = CHANNEL_NAMES[i];
        const slot = document.createElement('div');
        slot.className = `cchan c${letter.toLowerCase()}`;

        const block = document.createElement('span');
        block.className = `channel ${c.result}`;

        const main = document.createElement('span');
        main.className = 'channel-main';
        main.textContent = `${letter}:${c.result === 'exact' ? '✓' : c.value}`;
        block.appendChild(main);

        const caption = document.createElement('span');
        caption.className = 'channel-range';
        const gN = Math.max(0, Math.floor(c.band.green));
        const yN = Math.max(0, Math.floor(c.band.yellow));
        if (c.result === 'exact') caption.textContent = 'exact';
        else if (c.result === 'green') caption.textContent = `Δ ≤ ${gN}`;
        else if (c.result === 'yellow') caption.textContent = `Δ ≤ ${yN}`;
        else caption.textContent = `Δ > ${yN}`;
        block.appendChild(caption);

        block.title =
          `${letter} = ${c.value}   Δ = ${c.delta}\n` +
          `Ranges at this guess: green ≤${gN}, yellow ≤${yN}, red >${yN}`;

        slot.appendChild(block);

        const ranges = possibleRanges(c);
        const bar = document.createElement('div');
        bar.className = 'cbar';
        ranges.forEach(([lo, hi]) => {
          const fill = document.createElement('span');
          fill.className = 'cbar-fill';
          fill.style.left = `${(lo / 255) * 100}%`;
          fill.style.width = `${Math.max(0.6, ((hi - lo) / 255) * 100)}%`;
          bar.appendChild(fill);
        });
        bar.title = `${letter} target ∈ ${rangesLabel(ranges)}`;
        slot.appendChild(bar);

        channels.appendChild(slot);
      });
      row.appendChild(channels);

      const isIncorrect = g.channels.some((c) => c.result !== 'exact');
      if (isIncorrect) {
        const pct = nearnessPct(g.rgb, state.target);
        const near = document.createElement('span');
        near.className = 'nearness';
        near.style.background = `hsl(${pct * 1.2}, 58%, 38%)`;
        near.textContent = `${pct}%`;
        near.title = `Color nearness: 100% = exact, 0% = opposite corner of the RGB cube (e.g. white vs black)`;
        row.appendChild(near);
      }

      history.appendChild(row);
    });

    const result = $('result');
    if (state.done) {
      result.hidden = false;
      const hex = rgbToHex(state.target);
      const [r, g, b] = state.target;
      if (state.won) {
        const n = state.guesses.length;
        const msg = successMessage(n, state.maxGuesses);
        const tally = n === 1 ? "1 guess" : `${n} guesses`;
        result.innerHTML =
          `<h2>${msg}</h2><p>${hex} &nbsp;(${r}, ${g}, ${b}) in ${tally}.</p>`;
      } else {
        const best = bestGuess(state.guesses, state.target);
        const msg = failMessage(best.pct);
        const bhex = rgbToHex(best.guess.rgb);
        result.innerHTML =
          `<h2>${msg}</h2>` +
          `<p>The color was <span class="reveal" style="background:${hex}"></span> <strong>${hex}</strong> (${r}, ${g}, ${b}).</p>` +
          `<p class="best-line">Your best guess (#${best.idx + 1}): ` +
          `<span class="reveal" style="background:${bhex}"></span> <strong>${bhex}</strong> — ` +
          `<span class="best-pct" style="background:hsl(${best.pct * 1.2}, 58%, 38%)">${best.pct}%</span></p>`;
      }
    } else {
      result.hidden = true;
    }
    $('submitGuess').disabled = state.done;
  }

  function syncFromPicker() {
    const v = $('colorPicker').value;
    $('hexInput').value = v;
    $('hexInput').classList.remove('invalid');
    $('guessPreview').style.background = v;
  }

  function syncFromHex() {
    const raw = $('hexInput').value;
    const rgb = parseHex(raw);
    if (rgb) {
      const hex = rgbToHex(rgb);
      $('colorPicker').value = hex;
      $('guessPreview').style.background = hex;
      $('hexInput').classList.remove('invalid');
    } else {
      $('hexInput').classList.add('invalid');
    }
  }

  $('colorPicker').addEventListener('input', syncFromPicker);
  $('hexInput').addEventListener('input', syncFromHex);
  $('hexInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitGuess();
  });
  $('submitGuess').addEventListener('click', submitGuess);
  $('newGame').addEventListener('click', newGame);

  syncFromPicker();
  newGame();
})();
