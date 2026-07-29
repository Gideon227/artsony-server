"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compact = compact;
// Strips undefined-valued keys from an object. Needed because the project's
// tsconfig sets exactOptionalPropertyTypes: true — an optional field typed
// `foo?: string` does not accept an explicit `foo: undefined`, which is
// exactly what naive query-param parsing (`q.foo ? x : undefined`) produces.
// The return type reflects the removal: each key becomes genuinely optional
// (absent-or-present) rather than present-with-possible-undefined-value.
function compact(obj) {
    return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));
}
//# sourceMappingURL=object.utils.js.map