import React, { useEffect, useRef, useState } from 'react';
import { Square2StackIcon, CheckIcon } from '@heroicons/react/24/outline';
import { PullCord, type PullCordConfig } from 'pullcord';
import 'pullcord/pullcord.css';
import { Analytics } from '@vercel/analytics/react';
import Clock from './components/Clock';
import type { ClockThemeName } from './components/Clock/constants';

type InstallTarget = 'react' | 'agent';

type SyntaxKind = 'comment' | 'keyword' | 'component' | 'function' | 'property' | 'string';

/** A slice of the snippet. `kind` only decides its colour. */
interface SnippetToken {
  text: string;
  kind?: SyntaxKind;
}

/**
 * One source of truth for both the highlighted block on screen and the text the
 * copy button puts on the clipboard. Keeping these as two hand-written copies
 * had already let them drift apart, so the copied snippet was not the snippet
 * the visitor was reading.
 */
const INSTALL_SNIPPETS: Record<InstallTarget, (theme: ClockThemeName) => SnippetToken[]> = {
  react: (theme) => [
    { text: '// Follow Clock_installation.md from GitHub.', kind: 'comment' },
    { text: '\n' },
    { text: '// Copy only its “Copy” paths. Exclude every “Do not copy” path.', kind: 'comment' },
    { text: '\n\n' },
    { text: 'import', kind: 'keyword' },
    { text: ' ' },
    { text: 'Clock', kind: 'component' },
    { text: ' ' },
    { text: 'from', kind: 'keyword' },
    { text: ' ' },
    { text: "'./components/Clock'", kind: 'string' },
    { text: ';\n\n' },
    { text: 'export default function', kind: 'keyword' },
    { text: ' ' },
    { text: 'App', kind: 'function' },
    { text: '() {\n  ' },
    { text: 'return', kind: 'keyword' },
    { text: ' <' },
    { text: 'Clock', kind: 'component' },
    { text: ' ' },
    { text: 'theme', kind: 'property' },
    { text: '=' },
    { text: `"${theme}"`, kind: 'string' },
    { text: ' ' },
    { text: 'timeZone', kind: 'property' },
    { text: '=' },
    { text: '"Asia/Chennai"', kind: 'string' },
    { text: ' />;\n}' },
  ],
  agent: (theme) => [
    { text: 'Add the Timeless Clock to this React app.\n\n' },
    { text: 'Follow Clock_installation.md from github.com/asiffisa/Timeless-braun_clock.\n' },
    { text: 'Copy only its “Copy” paths. Exclude every “Do not copy” path.\n\n' },
    { text: '<' },
    { text: 'Clock', kind: 'component' },
    { text: ' ' },
    { text: 'theme', kind: 'property' },
    { text: '=' },
    { text: `"${theme}"`, kind: 'string' },
    { text: ' ' },
    { text: 'timeZone', kind: 'property' },
    { text: '=' },
    { text: '"Asia/Chennai"', kind: 'string' },
    { text: ' />;' },
  ],
};

const snippetToText = (tokens: SnippetToken[]) => tokens.map((token) => token.text).join('');

const InstallSnippet: React.FC<{ tokens: SnippetToken[] }> = ({ tokens }) => (
  <>
    {tokens.map((token, index) =>
      token.kind ? (
        <span key={index} className={`syntax-${token.kind}`}>
          {token.text}
        </span>
      ) : (
        <React.Fragment key={index}>{token.text}</React.Fragment>
      ),
    )}
  </>
);

/**
 * Mirrors the dark-theme wall URLs in index.css. They are only referenced under
 * `.timeless-page--dark`, so without this the browser would not start fetching
 * them until the cord is actually pulled, leaving the room daylit mid-switch.
 */
const DARK_WALL_IMAGES = ['/plaster-wall-moonlight-matched.webp', '/plaster-wall-dark.webp'];

// Tuned to the FeralUI reference feel: taut, responsive, and deep enough to read as a real pull.
const PULLCORD_CONFIG: Partial<PullCordConfig> = {
  gravity: 1925,
  damping: 0.935,
  iterations: 17,
  stretchMax: 44,
};

/** Subtle scroll swing configuration */
const CORD_SCROLL_SWING = {
  /** Scroll sensitivity: multiplier for scroll delta (lower = subtler motion) */
  sensitivity: 0.04,
  /** Hard cap on max sway angle in degrees */
  maxAngle: 3,
  /** Spring return strength to center */
  stiffness: 0.08,
  /** Energy absorption rate per frame (lower = stops oscillating faster) */
  damping: 0.82,
} as const;

const MOBILE_MONITOR = {
  horizontalInset: 10,
  maxScale: 0.58,
  sourceWidth: 570,
  sourceHeight: 374,
  bottomOffset: -34,
} as const;

type CopyState = 'idle' | 'copied' | 'failed';

const App: React.FC = () => {
  const [theme, setTheme] = useState<ClockThemeName>('light');
  const [installTarget, setInstallTarget] = useState<InstallTarget>('agent');
  const [copyState, setCopyState] = useState<CopyState>('idle');
  // Explicit `number`: MOBILE_MONITOR is `as const`, so inference would pin this
  // state to the literal type 0.58 and reject every value the observer computes.
  const [mobileMonitorScale, setMobileMonitorScale] = useState<number>(MOBILE_MONITOR.maxScale);
  const copyResetTimerRef = useRef<number | undefined>(undefined);
  const wallSceneRef = useRef<HTMLElement>(null);

  useEffect(
    () => () => {
      if (copyResetTimerRef.current !== undefined) {
        window.clearTimeout(copyResetTimerRef.current);
      }
    },
    [],
  );

  // Warm the moonlit wall once the page is idle, so the first cord pull swaps
  // instantly instead of waiting on a cold fetch.
  //
  // `<link rel="prefetch">` and not `new Image()`: the point is to get the bytes
  // into the HTTP cache, and decoding them up front would add ~12MB of bitmaps a
  // phone has no use for until the cord is actually pulled. The browser also
  // fetches these at the lowest priority, so they cannot crowd out the wall the
  // visitor is currently looking at.
  useEffect(() => {
    const links: HTMLLinkElement[] = [];

    const prefetch = () => {
      for (const href of DARK_WALL_IMAGES) {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.as = 'image';
        link.href = href;
        document.head.appendChild(link);
        links.push(link);
      }
    };

    const idle = window.requestIdleCallback;
    const handle = typeof idle === 'function'
      ? idle(prefetch, { timeout: 3000 })
      : window.setTimeout(prefetch, 1500);

    return () => {
      if (typeof idle === 'function') window.cancelIdleCallback?.(handle as number);
      else window.clearTimeout(handle as number);
      for (const link of links) link.remove();
    };
  }, []);

  useEffect(() => {
    const wallScene = wallSceneRef.current;
    if (!wallScene) return;

    const mobileQuery = window.matchMedia('(max-width: 720px)');
    let pendingFrame: number | null = null;

    const measure = () => {
      pendingFrame = null;
      if (!mobileQuery.matches) return;

      const availableWidth = wallScene.clientWidth - MOBILE_MONITOR.horizontalInset * 2;
      const nextScale = Math.min(
        MOBILE_MONITOR.maxScale,
        Math.max(0, availableWidth / MOBILE_MONITOR.sourceWidth),
      );

      setMobileMonitorScale((currentScale) => (
        Math.abs(currentScale - nextScale) < 0.001 ? currentScale : nextScale
      ));
    };

    // `.wall-scene` is a `width: 100%` block element, so ResizeObserver already
    // fires for every window resize or device rotation on its own — a separate
    // `window.addEventListener('resize', ...)` here would just repeat the same
    // layout read a second time on every one of those events. And because a
    // resize gesture can fire many events in a row, `measure` is coalesced to
    // at most once per rendered frame instead of running once per event.
    const scheduleMeasure = () => {
      if (pendingFrame !== null) return;
      pendingFrame = requestAnimationFrame(measure);
    };

    const observer = typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(scheduleMeasure);

    observer?.observe(wallScene);
    mobileQuery.addEventListener('change', scheduleMeasure);
    measure();

    return () => {
      if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
      observer?.disconnect();
      mobileQuery.removeEventListener('change', scheduleMeasure);
    };
  }, []);

  // Subtle scroll-driven sway for the pull cord
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let lastScrollY = window.scrollY;
    let angle = 0;
    let angularVelocity = 0;
    let animFrameId: number | null = null;
    let cordEl: HTMLElement | null = null;
    let lastSetSwing: string | null = null;

    const updatePhysics = () => {
      angularVelocity = (angularVelocity - angle * CORD_SCROLL_SWING.stiffness) * CORD_SCROLL_SWING.damping;
      angle += angularVelocity;

      angle = Math.min(Math.max(angle, -CORD_SCROLL_SWING.maxAngle), CORD_SCROLL_SWING.maxAngle);

      if (!cordEl) {
        cordEl = document.querySelector('.wall-scene .pull-cord') as HTMLElement | null;
      }

      const isMoving = Math.abs(angle) > 0.005 || Math.abs(angularVelocity) > 0.005;

      if (cordEl) {
        const nextSwing = isMoving ? `${angle.toFixed(2)}deg` : '0deg';
        if (nextSwing !== lastSetSwing) {
          cordEl.style.setProperty('--cord-swing', nextSwing);
          lastSetSwing = nextSwing;
        }
      }

      if (isMoving) {
        animFrameId = requestAnimationFrame(updatePhysics);
      } else {
        animFrameId = null;
      }
    };

    const startLoopIfNeeded = () => {
      if (animFrameId === null) {
        animFrameId = requestAnimationFrame(updatePhysics);
      }
    };

    const onScroll = () => {
      const currentScrollY = window.scrollY;
      const deltaY = currentScrollY - lastScrollY;
      lastScrollY = currentScrollY;

      const rawImpulse = deltaY * CORD_SCROLL_SWING.sensitivity;
      const impulse = Math.min(Math.max(rawImpulse, -CORD_SCROLL_SWING.maxAngle), CORD_SCROLL_SWING.maxAngle);
      angularVelocity += impulse;

      startLoopIfNeeded();
    };

    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      if (animFrameId !== null) {
        cancelAnimationFrame(animFrameId);
      }
    };
  }, []);

  const toggleTheme = () => {
    setTheme((currentTheme) => (currentTheme === 'light' ? 'dark' : 'light'));
  };

  const copySnippet = async () => {
    const snippet = snippetToText(INSTALL_SNIPPETS[installTarget](theme));
    let outcome: CopyState = 'copied';

    try {
      // The async Clipboard API needs a secure context, so a plain-http or
      // older browser still gets the selection-based fallback.
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(snippet);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = snippet;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        // iOS ignores select() on a readonly textarea unless the range is explicit.
        textarea.setSelectionRange(0, snippet.length);
        const succeeded = document.execCommand('copy');
        textarea.remove();
        if (!succeeded) outcome = 'failed';
      }
    } catch {
      // Permission denied, or no clipboard at all. Say so rather than looking
      // like the button simply did nothing.
      outcome = 'failed';
    }

    setCopyState(outcome);
    if (copyResetTimerRef.current !== undefined) {
      window.clearTimeout(copyResetTimerRef.current);
    }
    copyResetTimerRef.current = window.setTimeout(() => {
      setCopyState('idle');
      copyResetTimerRef.current = undefined;
    }, 4000);
  };

  const copied = copyState === 'copied';
  const snippetTokens = INSTALL_SNIPPETS[installTarget](theme);
  const nextThemeLabel = theme === 'light' ? 'dark' : 'light';
  const copyStatusMessage =
    copyState === 'copied'
      ? 'Copied to clipboard'
      : copyState === 'failed'
        ? 'Could not copy automatically. Select the code and copy it manually.'
        : '';
  const monitorStyle = {
    '--monitor-scale': mobileMonitorScale,
    '--monitor-bottom': `${MOBILE_MONITOR.sourceHeight * (MOBILE_MONITOR.maxScale - mobileMonitorScale) + MOBILE_MONITOR.bottomOffset}px`,
  } as React.CSSProperties;

  return (
    <main className={`timeless-page timeless-page--${theme}`}>
      <div className="timeless-frame">
        <header className="site-header">
          <a className="site-logo-link" href="#playground" aria-label="Timelapse home">
            <img src="/timelapse logo.png" alt="Timelapse Logo" className="header-logo" />
          </a>
        </header>

        <section className="intro" aria-labelledby="site-title">
          <h1 id="site-title">Analogue soul<br />on web canvas</h1>
        </section>

        <section ref={wallSceneRef} id="playground" className="wall-scene" aria-label="Clock playground">
          <div className="wall-clock">
            <Clock theme={theme} />
          </div>

          <PullCord
            className="pull-cord"
            onPull={toggleTheme}
            pulled={theme === 'dark'}
            ariaLabel={`Pull cord to switch to ${nextThemeLabel} mode`}
            config={PULLCORD_CONFIG}
          />

          <div id="install" className="monitor" aria-label="Installation monitor" style={monitorStyle}>
            <div className="monitor__bezel">
              <div className="monitor__screen">
                <div className="monitor__statusbar" aria-label="Terminal status">
                  <div className="monitor__lights" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <span className="monitor__statusbar-title">timeless / install</span>
                </div>
                <div className="monitor__toolbar">
                  <div className="install-tabs" aria-label="Installation format">
                    <button
                      type="button"
                      aria-pressed={installTarget === 'agent'}
                      className={installTarget === 'agent' ? 'is-active' : undefined}
                      onClick={() => setInstallTarget('agent')}
                    >
                      Agent
                    </button>
                    <button
                      type="button"
                      aria-pressed={installTarget === 'react'}
                      className={installTarget === 'react' ? 'is-active' : undefined}
                      onClick={() => setInstallTarget('react')}
                    >
                      React
                    </button>
                  </div>
                  <button
                    type="button"
                    className={`copy-button${copied ? ' is-copied' : ''}`}
                    aria-label={`Copy ${installTarget} code`}
                    title={copyState === 'failed' ? 'Could not copy automatically' : `Copy ${installTarget} code`}
                    onClick={copySnippet}
                  >
                    {copied ? (
                      <CheckIcon className="copy-button__icon text-emerald-400" strokeWidth={2.2} aria-hidden="true" />
                    ) : (
                      <Square2StackIcon className="copy-button__icon" strokeWidth={1.8} aria-hidden="true" />
                    )}
                  </button>
                </div>
                {/* The snippet itself is not a live region: it changes whenever the
                    cord is pulled, and re-reading a code block aloud on every
                    theme switch is noise. Only the copy result is announced. */}
                <pre aria-label={`${installTarget} code example`}>
                  <code>
                    <InstallSnippet tokens={snippetTokens} />
                    <span className="code-cursor" aria-hidden="true" />
                  </code>
                </pre>
                <p className="visually-hidden" role="status">
                  {copyStatusMessage}
                </p>
              </div>
            </div>
          </div>
        </section>

        <footer className="site-footer">
          <p className="footer-attribution">
            This web component is inspired by the classic{' '}
            <a
              href="https://braun-clocks.com/collections/analogue-clocks/products/bc26-braun-analogue-wall-clock-white"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-attribution-link"
            >
              Braun BC26
            </a>{' '}
            clock design.
          </p>
          <div className="footer-divider" aria-hidden="true" />
          <div className="footer-content">
            <div className="footer-info">
              <a
                href="https://cradlstudio.in/"
                target="_blank"
                rel="noopener noreferrer"
                className="footer-signature-link"
              >
                <img src="/asif%20sign.png" alt="Asif Signature" className="footer-signature" />
              </a>
              <a
                href="https://cradlstudio.in/"
                target="_blank"
                rel="noopener noreferrer"
                className="footer-website-link"
              >
                cradlstudio.in
              </a>
            </div>
            <div className="footer-socials">
              <a
                href="https://github.com/asiffisa/Timeless-braun_clock"
                target="_blank"
                rel="noopener noreferrer"
                className="footer-social-link"
                aria-label="GitHub Repository"
              >
                <svg className="footer-social-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
              </a>
              <a
                href="https://x.com/asifb_"
                target="_blank"
                rel="noopener noreferrer"
                className="footer-social-link"
                aria-label="X (Twitter)"
              >
                <svg className="footer-social-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
            </div>
          </div>
        </footer>
      </div>
      <Analytics />
    </main>
  );
};

export default App;
