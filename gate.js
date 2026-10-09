(() => {
  'use strict';
  const FORMAT = 'aqua-pages-v1';
  const encoder = new TextEncoder();
  const base = new URL('./', location.href);
  const storageKey = `aqua-pages-access:${base.pathname}`;
  const form = document.getElementById('gate-form');
  const passwordInput = document.getElementById('gate-password');
  const remember = document.getElementById('gate-remember');
  const submit = document.getElementById('gate-submit');
  const label = document.getElementById('gate-submit-label');
  const message = document.getElementById('gate-message');
  let busy = false;
  let envelopePromise;
  const fromBase64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
  const toBase64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
  const clearAccess = () => { try { sessionStorage.removeItem(storageKey); } catch {} };
  const setBusy = value => {
    busy = value;
    submit.disabled = value;
    passwordInput.disabled = value;
    form.setAttribute('aria-busy', String(value));
    document.body.classList.toggle('gate-loading', value);
    label.textContent = value ? 'Otwieranie projektu…' : 'Otwórz konfigurator';
  };

  async function envelope() {
    if (!envelopePromise) envelopePromise = (async () => {
      const response = await fetch(new URL('app.encrypted.json', base), { cache: 'no-cache', credentials: 'same-origin' });
      if (!response.ok) throw new Error('download');
      const data = await response.json();
      if (data.format !== FORMAT || data.kdf !== 'PBKDF2' || data.hash !== 'SHA-256' || data.iterations !== 600000 || fromBase64(data.salt).length !== 32 || fromBase64(data.iv).length !== 12) throw new Error('package');
      return data;
    })();
    try { return await envelopePromise; } catch (error) { envelopePromise = undefined; throw error; }
  }

  async function deriveKey(password, data) {
    const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: fromBase64(data.salt), iterations: data.iterations, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      true,
      ['decrypt'],
    );
  }

  async function decrypt(key, data) {
    const cleartext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(data.iv), additionalData: encoder.encode(FORMAT), tagLength: 128 },
      key,
      fromBase64(data.ciphertext),
    );
    const app = JSON.parse(new TextDecoder().decode(cleartext));
    if (app.format !== FORMAT || !app.files?.['index.html'] || !app.files?.['app.js']) throw new Error('package');
    return app;
  }

  function absoluteStylesheet(css, filename) {
    const stylesheetBase = new URL(filename, base);
    return css.replace(/url\(\s*(['"]?)([^'"\s)]+)\1\s*\)/gi, (match, quote, value) => {
      if (/^(?:data:|blob:|#)/i.test(value)) return match;
      return `url("${new URL(value, stylesheetBase).href}")`;
    });
  }

  function openApplication(app) {
    const parsed = new DOMParser().parseFromString(app.files['index.html'], 'text/html');
    const mappings = {};
    for (const script of parsed.querySelectorAll('script[type="importmap"]')) {
      const original = JSON.parse(script.textContent);
      for (const [specifier, target] of Object.entries(original.imports || {})) mappings[specifier] = new URL(target, base).href;
      if (original.scopes) throw new Error('Unsupported scoped import map.');
      script.remove();
    }
    const urls = new Map();
    for (const [filename, contents] of Object.entries(app.files)) {
      if (!filename.endsWith('.js')) continue;
      const url = URL.createObjectURL(new Blob([contents], { type: 'text/javascript' }));
      urls.set(filename, url);
      mappings[`aqua-private/${filename}`] = url;
    }
    for (const link of parsed.querySelectorAll('link[rel="stylesheet"][href]')) {
      const resolved = new URL(link.getAttribute('href'), base);
      const filename = resolved.origin === base.origin && resolved.pathname.startsWith(base.pathname) ? resolved.pathname.slice(base.pathname.length) : null;
      if (filename && Object.hasOwn(app.files, filename)) {
        const style = parsed.createElement('style');
        style.textContent = absoluteStylesheet(app.files[filename], filename);
        link.replaceWith(style);
      }
    }
    for (const script of parsed.querySelectorAll('script[type="module"][src]')) {
      const resolved = new URL(script.getAttribute('src'), base);
      const filename = resolved.pathname.slice(base.pathname.length);
      if (!urls.has(filename)) throw new Error('Missing entry module.');
      script.setAttribute('src', urls.get(filename));
    }
    parsed.querySelectorAll('base').forEach(element => element.remove());
    const baseElement = parsed.createElement('base');
    baseElement.href = base.href;
    const importmap = parsed.createElement('script');
    importmap.type = 'importmap';
    importmap.textContent = JSON.stringify({ imports: mappings });
    parsed.head.prepend(baseElement, importmap);
    const robots = parsed.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex,nofollow';
    parsed.head.append(robots);
    passwordInput.value = '';
    // Blob URLs live until the tab closes so later dynamic module imports work.
    // A reload fetches the gate again; the optional tab-specific key unlocks it.
    document.open();
    document.write(`<!doctype html>\n${parsed.documentElement.outerHTML}`);
    document.close();
  }

  async function unlock(password, cached = null) {
    if (busy) return;
    message.textContent = '';
    setBusy(true);
    try {
      if (!globalThis.crypto?.subtle) throw new Error('crypto');
      const data = await envelope();
      let key;
      if (cached) {
        if (cached.salt !== data.salt) throw new Error('expired');
        key = await crypto.subtle.importKey('raw', fromBase64(cached.key), 'AES-GCM', false, ['decrypt']);
      } else key = await deriveKey(password, data);
      const app = await decrypt(key, data);
      if (!cached) {
        clearAccess();
        if (remember.checked) {
          const rawKey = await crypto.subtle.exportKey('raw', key);
          try { sessionStorage.setItem(storageKey, JSON.stringify({ salt: data.salt, key: toBase64(rawKey) })); } catch {}
        }
      }
      openApplication(app);
    } catch (error) {
      if (cached) clearAccess();
      message.textContent = error.message === 'crypto' ? 'Otwórz stronę przez HTTPS w aktualnej przeglądarce.'
        : error.message === 'download' || error instanceof TypeError ? 'Nie udało się pobrać projektu. Sprawdź połączenie i spróbuj ponownie.'
        : error.message === 'expired' ? 'Projekt został zaktualizowany. Wprowadź hasło ponownie.'
        : error.name === 'OperationError' ? (cached ? 'Wprowadź hasło, aby ponownie otworzyć projekt.' : 'Nieprawidłowe hasło. Spróbuj ponownie.')
        : 'Nie udało się otworzyć projektu. Odśwież stronę i spróbuj ponownie.';
      setBusy(false);
      passwordInput.focus();
      passwordInput.select();
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (form.reportValidity()) unlock(passwordInput.value);
  });
  document.getElementById('gate-reveal').addEventListener('click', event => {
    const shown = passwordInput.type === 'password';
    passwordInput.type = shown ? 'text' : 'password';
    event.currentTarget.setAttribute('aria-pressed', String(shown));
    event.currentTarget.setAttribute('aria-label', shown ? 'Ukryj hasło' : 'Pokaż hasło');
    passwordInput.focus();
  });
  try {
    const stored = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    if (stored?.key && stored?.salt) unlock('', stored);
  } catch { clearAccess(); }
})();
