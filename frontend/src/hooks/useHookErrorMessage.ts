type ErrorContext = {
  fallbackMessage: string;
  hookName: string;
  id?: string;
};

function hasMessage(value: unknown): value is { message: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof (value as { message?: unknown }).message === "string" &&
    (value as { message: string }).message.trim().length > 0
  );
}

function readServerMessage(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;

  const maybeResponse = (error as { response?: unknown }).response;
  if (maybeResponse && typeof maybeResponse === "object") {
    const data = (maybeResponse as { data?: unknown }).data;
    if (hasMessage(data)) return data.message;
    if (hasMessage(maybeResponse)) return maybeResponse.message;
  }

  const data = (error as { data?: unknown }).data;
  if (hasMessage(data)) return data.message;

  return null;
}

function isNetworkError(error: unknown) {
  if (error instanceof TypeError) return true;
  if (!error || typeof error !== "object") return false;

  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && ["ERR_NETWORK", "ECONNABORTED", "ENOTFOUND"].includes(code)) {
    return true;
  }

  return hasMessage(error) && /network|fetch|timeout|failed to fetch/i.test(error.message);
}

export function getHookErrorMessage(error: unknown, fallbackMessage: string) {
  const serverMessage = readServerMessage(error);
  if (serverMessage) return serverMessage;
  if (isNetworkError(error)) {
    return "Network error. Please check your connection and try again.";
  }
  if (hasMessage(error)) return error.message;
  return fallbackMessage;
}

export function logHookError(error: unknown, { fallbackMessage, hookName, id }: ErrorContext) {
  console.error(`${hookName} failed${id ? ` for ${id}` : ""}:`, error);
  return getHookErrorMessage(error, fallbackMessage);
}
