"use strict";
// ── Enums (mirror SQL enums exactly) ─────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.BLOCKED_EXTERNAL_HOSTS = exports.ALLOWED_EXTERNAL_MIME_TYPES = exports.ALLOWED_EXTERNAL_PROTOCOLS = void 0;
// ── SSRF-safe external link config ────────────────────────────────────────────
// Used by the service layer to validate EXTERNAL_LINK assets before persisting.
exports.ALLOWED_EXTERNAL_PROTOCOLS = new Set(['https:']);
exports.ALLOWED_EXTERNAL_MIME_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
    'image/svg+xml',
    'video/mp4', 'video/webm',
    'model/gltf-binary', 'model/gltf+json',
]);
// Domains that are explicitly blocked regardless of protocol / MIME.
// Extend as needed; sourced from common phishing / SSRF pivot targets.
exports.BLOCKED_EXTERNAL_HOSTS = new Set([
    'localhost', '127.0.0.1', '0.0.0.0', '::1',
    'metadata.google.internal', // GCP IMDS
    '169.254.169.254', // AWS/Azure IMDS
    '100.100.100.200', // Alibaba IMDS
]);
//# sourceMappingURL=artwork.types.js.map