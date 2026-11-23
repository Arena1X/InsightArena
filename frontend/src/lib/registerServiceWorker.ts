export function registerServiceWorker(onWaiting?: (worker: ServiceWorker) => void) {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (process.env.NODE_ENV !== "production") return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        // A worker only waits when an older one still controls the page, so skip first installs.
        if (registration.waiting && navigator.serviceWorker.controller) {
          onWaiting?.(registration.waiting);
        }
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          installing?.addEventListener("statechange", () => {
            if (
              installing.state === "installed" &&
              registration.waiting &&
              navigator.serviceWorker.controller
            ) {
              onWaiting?.(registration.waiting);
            }
          });
        });
      })
      .catch((error) => {
        console.error("Service worker registration failed:", error);
      });
  });
}
