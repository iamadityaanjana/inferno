export async function readApiJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(res.ok ? "Empty response from server" : `Server error ${res.status}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      res.ok ? "Server returned invalid JSON" : `Server error ${res.status}: ${text.slice(0, 160)}`,
    );
  }
}

export async function readBody<T>(req: Request): Promise<T> {
  const text = await req.text();
  if (!text.trim()) return {} as T;
  return JSON.parse(text) as T;
}

export function fail(error: unknown, fallback: string, status = 500) {
  const message = error instanceof Error ? error.message : fallback;
  return Response.json({ error: message }, { status });
}
