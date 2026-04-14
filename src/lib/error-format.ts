/**
 * Format any error into a detailed, human-readable string.
 * Handles: Error, Supabase PostgrestError, Network errors, plain objects
 */
export function formatError(error: unknown, context?: string): string {
  const parts: string[] = [];

  if (context) {
    parts.push(`[${context}]`);
  }

  if (error instanceof Error) {
    parts.push(error.message);
    if (error.cause) {
      parts.push(`Cause: ${error.cause}`);
    }
    if ((error as any).code) {
      parts.push(`Code: ${(error as any).code}`);
    }
    if ((error as any).details) {
      parts.push(`Details: ${(error as any).details}`);
    }
    if ((error as any).hint) {
      parts.push(`Hint: ${(error as any).hint}`);
    }
  } else if (error && typeof error === "object") {
    const err = error as Record<string, unknown>;

    // Supabase PostgrestError shape
    if (err.message) parts.push(String(err.message));
    if (err.code) parts.push(`Code: ${err.code}`);
    if (err.details) parts.push(`Details: ${err.details}`);
    if (err.hint) parts.push(`Hint: ${err.hint}`);
    if (err.status) parts.push(`Status: ${err.status}`);
    if (err.statusText) parts.push(`StatusText: ${err.statusText}`);
    if (err.url) parts.push(`URL: ${err.url}`);

    // Fallback: stringify remaining properties
    if (parts.length === 0) {
      parts.push(JSON.stringify(err));
    }
  } else {
    parts.push(String(error));
  }

  return parts.join(" | ");
}

/**
 * Try to read response body for error details.
 * Returns empty string if body cannot be read.
 */
export async function readResponseError(res: Response): Promise<string> {
  try {
    const text = await res.text();
    // Truncate long bodies
    return text.length > 500 ? text.substring(0, 500) + "..." : text;
  } catch {
    return "(could not read body)";
  }
}
