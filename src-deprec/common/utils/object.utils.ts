// Strips undefined-valued keys from an object. Needed because the project's
// tsconfig sets exactOptionalPropertyTypes: true — an optional field typed
// `foo?: string` does not accept an explicit `foo: undefined`, which is
// exactly what naive query-param parsing (`q.foo ? x : undefined`) produces.
// The return type reflects the removal: each key becomes genuinely optional
// (absent-or-present) rather than present-with-possible-undefined-value.
export function compact<T extends Record<string, unknown>>(
  obj: T
): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  ) as { [K in keyof T]?: Exclude<T[K], undefined> }
}
