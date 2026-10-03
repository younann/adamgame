/**
 * Technical error log — only ever shown in the Parent Zone, never to Adam.
 * Stored in localStorage under 'adam-error-log' (bounded).
 */
const KEY = 'adam-error-log';

export function logError(where: string, err: unknown) {
  const message = `${where}: ${err instanceof Error ? `${err.message}` : String(err)}`;
  if (process.env.NODE_ENV !== 'production') console.error(message, err);
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as { ts: number; message: string }[];
    list.push({ ts: Date.now(), message: message.slice(0, 400) });
    localStorage.setItem(KEY, JSON.stringify(list.slice(-50)));
  } catch {
    /* ignore */
  }
}
