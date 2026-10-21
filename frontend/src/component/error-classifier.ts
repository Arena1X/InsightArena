export type ErrorClass =
  | "network"       // fetch failed / offline
  | "auth"          // 401 / 403
  | "not-found"     // 404 (handled separately, kept for completeness)
  | "server"        // 5xx
  | "timeout"       // request timed out
  | "chunk-load"    // dynamic import / chunk loading failure
  | "unknown";      // everything else

export type ClassifiedError = {
  errorClass: ErrorClass;
  headline: string;   // short title, e.g. "Connection Problem"
  detail: string;     // one-sentence explanation suitable for the UI
};

export function classifyError(error: Error & { status?: number | null }): ClassifiedError {
  const status = error.status;
  const message = error.message ?? "";
  const name = error.name ?? "";

  // Rule 1: 401 or 403 → auth
  if (status === 401 || status === 403) {
    return {
      errorClass: "auth",
      headline: "Access Denied",
      detail: "You don't have permission to view this page. Try signing in again.",
    };
  }

  // Rule 2: 408 or timeout message → timeout
  if (status === 408 || /timed? ?out/i.test(message)) {
    return {
      errorClass: "timeout",
      headline: "Request Timed Out",
      detail: "The server took too long to respond. Check your connection and try again.",
    };
  }

  // Rule 3: 5xx status → server
  if (typeof status === "number" && status >= 500 && status <= 599) {
    return {
      errorClass: "server",
      headline: "Server Error",
      detail: "Our servers ran into an issue. We've been notified and are working on a fix.",
    };
  }

  // Rule 4: chunk-load patterns → chunk-load
  if (/chunkload|loading chunk|failed to fetch dynamically imported module/i.test(message)) {
    return {
      errorClass: "chunk-load",
      headline: "Update Available",
      detail: "A new version of the app was deployed. Retrying will load the latest version.",
    };
  }

  // Rule 5: TypeError with network-like message → network
  if (name === "TypeError" && /failed to fetch|network|load failed/i.test(message)) {
    return {
      errorClass: "network",
      headline: "Connection Problem",
      detail: "Check your internet connection and try again.",
    };
  }

  // Rule 6: NetworkError name → network
  if (name === "NetworkError" || /networkerror/i.test(name)) {
    return {
      errorClass: "network",
      headline: "Connection Problem",
      detail: "Check your internet connection and try again.",
    };
  }

  // Fallback: unknown
  return {
    errorClass: "unknown",
    headline: "Something Went Wrong",
    detail: "An unexpected error occurred. Retrying usually fixes this.",
  };
}
