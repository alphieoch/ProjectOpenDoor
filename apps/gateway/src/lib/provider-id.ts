const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Postgres uuid columns reject slugs like "together". */
export function asUuid(value: string | null | undefined): string | null {
  return value && UUID_RE.test(value) ? value : null;
}
