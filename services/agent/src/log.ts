export type LogFields = Record<string, unknown>;

export function log(level: "info" | "error", message: string, fields: LogFields = {}): void {
  const line = JSON.stringify({ level, message, ...fields, at: new Date().toISOString() });
  if (level === "error") console.error(line);
  else console.log(line);
}
