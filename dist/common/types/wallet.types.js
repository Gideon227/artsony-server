"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WITHDRAWAL_TRANSITIONS = void 0;
exports.WITHDRAWAL_TRANSITIONS = {
    PENDING: ['PROCESSING', 'REJECTED', 'CANCELLED'],
    PROCESSING: ['COMPLETED', 'FAILED'],
    COMPLETED: [],
    REJECTED: [],
    FAILED: [],
    CANCELLED: [],
};
//# sourceMappingURL=wallet.types.js.map