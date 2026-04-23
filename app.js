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
      const result = classify(delta, state.thresholds[i]);
      return { value: v, delta, result };
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

  function render() {
    $('targetSwatch').style.background = rgbToHex(state.target);
    $('guessCount').textContent = state.guesses.length;
    $('maxGuessesLabel').textContent = state.maxGuesses;

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
        const block = document.createElement('span');
        block.className = `channel ${c.result}`;
        const label = c.result === 'exact' ? '✓' : c.value;
        block.textContent = `${CHANNEL_NAMES[i]}:${label}`;
        block.title = `${CHANNEL_NAMES[i]} guess ${c.value}, Δ=${c.delta}`;
        channels.appendChild(block);
      });
      row.appendChild(channels);
      history.appendChild(row);
    });

    const result = $('result');
    if (state.done) {
      result.hidden = false;
      const hex = rgbToHex(state.target);
      const [r, g, b] = state.target;
      if (state.won) {
        result.innerHTML =
          `<h2>You got it!</h2><p>${hex} &nbsp;(${r}, ${g}, ${b}) in ${state.guesses.length} ${state.guesses.length === 1 ? 'guess' : 'guesses'}.</p>`;
      } else {
        result.innerHTML =
          `<h2>Out of guesses</h2><p>The color was <span class="reveal" style="background:${hex}"></span> <strong>${hex}</strong> (${r}, ${g}, ${b}).</p>`;
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
