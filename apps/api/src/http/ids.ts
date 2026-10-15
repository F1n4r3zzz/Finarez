const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Route ids that can't be UUIDs answer 404 like unknown ones, before reaching the database. */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}
