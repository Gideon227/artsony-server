"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.blockService = void 0;
const block_repository_1 = require("../repositories/block.repository");
const errors_1 = require("../../../common/errors");
exports.blockService = {
    async block(blockerId, blockedId) {
        if (blockerId === blockedId) {
            throw new errors_1.ValidationError('Validation failed', { blocked_id: 'You cannot block yourself' });
        }
        await block_repository_1.blockRepository.block(blockerId, blockedId);
    },
    async unblock(blockerId, blockedId) {
        await block_repository_1.blockRepository.unblock(blockerId, blockedId);
    },
    async isBlocked(blockerId, blockedId) {
        return block_repository_1.blockRepository.isBlocked(blockerId, blockedId);
    },
    async listBlocked(blockerId, filters) {
        return block_repository_1.blockRepository.listBlocked(blockerId, filters);
    },
};
//# sourceMappingURL=block.service.js.map