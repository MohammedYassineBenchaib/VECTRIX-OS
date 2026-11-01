export interface ApiErrorShape {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function parseError(response: Response): Promise<ApiClientError> {
  let body: { error?: ApiErrorShape } | null = null;
  try {
    body = (await response.json()) as { error?: ApiErrorShape };
  } catch {
    // Non-JSON failures (proxy errors, aborted streams) fall through to a generic message.
  }
  const error = body?.error;
  return new ApiClientError(
    response.status,
    error?.code ?? "REQUEST_FAILED",
    error?.message ?? `Request failed with status ${response.status}.`,
    error?.details,
  );
}

export async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = init;
  const response = await fetch(path, {
    ...rest,
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "An unexpected error occurred.";
}

export function validationDetails(error: unknown): string[] {
  if (!(error instanceof ApiClientError) || !Array.isArray(error.details)) return [];
  return error.details
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const issue = item as { path?: unknown; message?: unknown };
        const path = Array.isArray(issue.path) ? issue.path.join(".") : "";
        return [path, typeof issue.message === "string" ? issue.message : ""]
          .filter(Boolean)
          .join(": ");
      }
      return "";
    })
    .filter(Boolean);
}
