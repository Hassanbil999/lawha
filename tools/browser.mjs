/* Lawha — drive the real extension in a real Chrome, headlessly.
 *
 * The static checks prove the code is shaped right. They cannot prove the
 * product renders: a CSS custom property that resolves to nothing, a preview
 * scaled by the wrong factor, a service worker that never answers — all of it
 * passes every grep and every parse, and all of it is only visible on a page.
 *
 * Chrome 137+ ignores `--load-extension` outright: the extension silently does
 * not load, every chrome-extension:// navigation comes back
 * ERR_BLOCKED_BY_CLIENT, and nothing says why. The path that still works is the
 * DevTools protocol — launch with `--enable-unsafe-extension-debugging`, attach
 * to the browser target, and call `Extensions.loadUnpacked`, which hands back
 * the extension id. Node 22 has a global WebSocket, so the client below is the
 * whole dependency list.
 *
 * Dev-only; it never ships. Used by `node tools/browser-check.mjs`.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* Chrome moves around depending on how it was installed; LAWHA_CHROME wins. */
const CHROME_CANDIDATES = [
  process.env.LAWHA_CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].filter(Boolean);

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    const full = path.resolve(candidate);
    if (existsSync(full)) return full;
  }
  return null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class CDP {
  constructor(socket) {
    this.socket = socket;
    this.seq = 0;
    this.pending = new Map();
    this.handlers = new Map();
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    const client = new CDP(socket);
    socket.addEventListener('message', (event) => client.receive(JSON.parse(event.data)));
    return client;
  }

  receive(message) {
    if (message.id != null && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(`${message.error.message} (${message.error.code})`));
      else resolve(message.result);
      return;
    }
    if (!message.method) return;
    for (const handler of this.handlers.get(message.method) ?? []) {
      handler(message.params, message.sessionId);
    }
  }

  on(method, handler) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(handler);
  }

  send(method, params = {}, sessionId) {
    const id = (this.seq += 1);
    const payload = sessionId ? { id, method, params, sessionId } : { id, method, params };
    this.socket.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  close() {
    try {
      this.socket.close();
    } catch {
      // already gone
    }
  }
}

async function browserTarget(port, attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      const json = await response.json();
      if (json.webSocketDebuggerUrl) return json;
    } catch {
      // the port is not listening yet
    }
    await sleep(250);
  }
  throw new Error('Chrome never opened its debugging port');
}

/**
 * Launch headless Chrome with the extension loaded, and return a session.
 *
 * `port` defaults to a random one on purpose. A fixed port lets a previous
 * Chrome that is still shutting down answer /json/version and hand back a
 * stale browser — which shows up as a check that passes alone and fails in a
 * run, the least useful failure there is.
 */
export async function launch({ extension, port = 9400 + Math.floor(Math.random() * 500) } = {}) {
  const chrome = findChrome();
  if (!chrome) {
    throw new Error(`No Chrome found. Set LAWHA_CHROME to its path.`);
  }

  const profile = mkdtempSync(path.join(tmpdir(), 'lawha-profile-'));
  const child = spawn(
    chrome,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      '--enable-unsafe-extension-debugging',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--hide-scrollbars',
      // the feed fixture below is served with a certificate it signed itself
      '--ignore-certificate-errors',
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  const info = await browserTarget(port);
  const cdp = await CDP.connect(info.webSocketDebuggerUrl);
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: path.resolve(extension) });

  return {
    cdp,
    extensionId: id,
    chromeVersion: info.Browser,

    /**
     * Open an extension page and attach to it.
     *
     * `ready` is polled rather than waited on as a load event: every surface
     * here boots asynchronously, so "the document finished parsing" is a
     * different moment from "the Scene is on the page".
     */
    async page(relative, { ready = 'document.readyState === "complete"', timeout = 20000 } = {}) {
      const url = relative.includes('://') ? relative : `chrome-extension://${id}/${relative}`;
      const { targetId } = await cdp.send('Target.createTarget', { url });
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
      await cdp.send('Runtime.enable', {}, sessionId);
      await cdp.send('Page.enable', {}, sessionId);

      const logs = [];
      cdp.on('Runtime.consoleAPICalled', (params, session) => {
        if (session !== sessionId) return;
        const args = params.args.map((arg) => arg.value ?? arg.description ?? arg.type);
        logs.push(`${params.type}: ${args.join(' ')}`);
      });
      cdp.on('Runtime.exceptionThrown', (params, session) => {
        if (session !== sessionId) return;
        const detail = params.exceptionDetails;
        logs.push(`EXCEPTION: ${detail.exception?.description ?? detail.text}`);
      });

      const api = {
        sessionId,
        logs,

        /** Evaluate an expression. Note: an expression, so no top-level await. */
        async evaluate(expression, { awaitPromise = true } = {}) {
          const result = await cdp.send(
            'Runtime.evaluate',
            { expression, awaitPromise, returnByValue: true, userGesture: true },
            sessionId
          );
          if (result.exceptionDetails) {
            const detail = result.exceptionDetails;
            throw new Error(detail.exception?.description ?? detail.text);
          }
          return result.result.value;
        },

        /** Run a body that may use await and return — the usual case here. */
        run(body) {
          return api.evaluate(`(async () => { ${body} })()`);
        },

        async waitFor(expression, ms = timeout) {
          const deadline = Date.now() + ms;
          for (;;) {
            try {
              if (await api.evaluate(expression)) return true;
            } catch {
              // the page is still booting; the module may not be there yet
            }
            if (Date.now() > deadline) return false;
            await sleep(120);
          }
        },

        /** A screenshot composites same-origin iframes, which is the only way
         *  to see what a gallery card is really showing. */
        async shot(file) {
          const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
          writeFileSync(file, Buffer.from(data, 'base64'));
          return file;
        },

        async width(pixels) {
          await cdp.send(
            'Emulation.setDeviceMetricsOverride',
            { width: pixels, height: 900, deviceScaleFactor: 1, mobile: false },
            sessionId
          );
        },

        close() {
          return cdp.send('Target.closeTarget', { targetId });
        },
      };

      await api.waitFor(ready);
      return api;
    },

    async kill() {
      cdp.close();
      child.kill();
      await sleep(300);
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {
        // Windows keeps a handle on the profile for a moment; it is a temp dir
      }
    },
  };
}
