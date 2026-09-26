import "@testing-library/jest-dom/vitest";

// On Node 22.4+/24+, `globalThis.localStorage`/`sessionStorage` are native,
// but without a valid `--localstorage-file` they resolve to a non-functional
// stub object (getItem/setItem/clear are all undefined, only a runtime
// warning marks it). Vitest's jsdom environment only copies jsdom's real,
// working Storage implementation onto a global key when that key isn't
// already present on `global` -- since the broken native stub is already
// there, it silently wins, and every test relying on localStorage/
// sessionStorage breaks. Re-point both at jsdom's real implementation,
// exposed by Vitest as `globalThis.jsdom.window`.
const jsdomWindow = (globalThis as { jsdom?: { window: Window } }).jsdom?.window;
if (jsdomWindow) {
  for (const key of ["localStorage", "sessionStorage"] as const) {
    if (typeof (globalThis as unknown as Record<string, Storage>)[key]?.getItem === "function") continue;
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: jsdomWindow[key],
    });
  }
}
