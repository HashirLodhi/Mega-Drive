import "server-only";

const MAX_RETRIES = 4;
const BASE_DELAY_MS = 600;
const MAX_DELAY_MS = 30_000;

export class RetryError extends Error {
  attempts: number;
  constructor(message: string, attempts: number) {
    super(message);
    this.name = "RetryError";
    this.attempts = attempts;
  }
}

function isRetryable(error: unknown): boolean {
  if (error instanceof TypeError) {
    const msg = (error.message || "").toLowerCase();
    if (msg.includes("fetch") || msg.includes("network") || msg.includes("timeout") || msg.includes("aborted") || msg.includes("econnreset") || msg.includes("econnrefused") || msg.includes("socket hang up")) return true;
    return false;
  }
  if (error instanceof RetryError) return false;
  const msg = (error as Error)?.message || "";
  if (msg.includes("ECONNRESET") || msg.includes("ETIMEDOUT") || msg.includes("socket hang up") || msg.includes("network") || msg.includes("aborted")) return true;
  return false;
}

function retryableStatusCode(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function getRetryDelay(attempt: number, response?: Response): number {
  if (response?.status === 429) {
    const retryAfter = response.headers.get("retry-after");
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds) && seconds > 0) return Math.min(seconds * 1000, MAX_DELAY_MS);
    }
  }
  const jitter = Math.random() * BASE_DELAY_MS;
  return Math.min(BASE_DELAY_MS * Math.pow(2, attempt) + jitter, MAX_DELAY_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { retries?: number; label?: string; onRetry?: (attempt: number, error: unknown, delay: number) => void } = {},
): Promise<T> {
  const maxRetries = options.retries ?? MAX_RETRIES;
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries) break;
      if (!isRetryable(error)) {
        if (error instanceof Response && !retryableStatusCode(error.status)) break;
        if (error instanceof GoogleApiError && !retryableStatusCode(error.status)) break;
      }
      const delay = getRetryDelay(attempt, error instanceof Response ? error : undefined);
      options.onRetry?.(attempt + 1, error, delay);
      await sleep(delay);
    }
  }
  throw new RetryError(
    `${options.label || "Operation"} failed after ${maxRetries + 1} attempts: ${(lastError as Error)?.message || lastError}`,
    maxRetries + 1,
  );
}

export class GoogleApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Google API ${status}: ${body.slice(0, 500)}`);
    this.name = "GoogleApiError";
    this.status = status;
    this.body = body;
  }
}

export async function fetchWithRetry(
  url: string | URL,
  init: RequestInit = {},
  options: { retries?: number; label?: string } = {},
): Promise<Response> {
  const maxRetries = options.retries ?? MAX_RETRIES;
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries || !isRetryable(error)) break;
      const delay = getRetryDelay(attempt);
      await sleep(delay);
      continue;
    }
    if (response.ok || !retryableStatusCode(response.status)) return response;
    lastError = new GoogleApiError(response.status, await response.text().catch(() => ""));
    if (attempt >= maxRetries) break;
    const delay = getRetryDelay(attempt, response);
    await sleep(delay);
  }
  if (lastError instanceof GoogleApiError) throw lastError;
  throw new RetryError(
    `${options.label || "Fetch"} failed after ${maxRetries + 1} attempts: ${(lastError as Error)?.message || lastError}`,
    maxRetries + 1,
  );
}

export { retryableStatusCode };
