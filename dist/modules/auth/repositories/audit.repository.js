"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditRepository = void 0;
const database_1 = require("../../../config/database");
const uuid_1 = require("uuid");
exports.auditRepository = {
    // Fire-and-forget — audit writes must never block the request path.
    // Failures are logged to stderr but not re-thrown.
    log(input) {
        (0, database_1.supabase)()
            .from('audit_logs')
            .insert({
            id: (0, uuid_1.v4)(),
            user_id: input.userId ?? null,
            action: input.action,
            ip_address: input.ipAddress ?? null,
            user_agent: input.userAgent ?? null,
            metadata: input.metadata ?? {},
        })
            .then(({ error }) => {
            if (error)
                console.error('[AuditLog] Write failed:', error.message);
        });
    },
    async findByUserId(userId, limit = 50) {
        const result = await (0, database_1.supabase)()
            .from('audit_logs')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (result.error) {
            console.error('[AuditLog] Read failed:', result.error.message);
            return [];
        }
        return (result.data ?? []).map((row) => ({
            ...row,
            ip_address: row.ip_address ?? null,
            created_at: new Date(row.created_at),
        }));
    },
};
//# sourceMappingURL=audit.repository.js.map