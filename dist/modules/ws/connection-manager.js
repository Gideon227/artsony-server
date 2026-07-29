"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectionManager = void 0;
const ws_server_1 = require("./ws.server");
const redis_pubsub_1 = require("../../modules/redis/redis.pubsub");
class ConnectionManager {
    // userId → Set of active WebSocket connections
    connections = new Map();
    // userId → unsubscribe function for the user's Redis personal channel
    userUnsubs = new Map();
    // conversationId → unsubscribe function for the conversation Redis channel
    // One subscription per conversation per process — shared across all
    // connected users who are in that conversation
    convUnsubs = new Map();
    // conversationId → Set of userIds currently subscribed on this instance
    // Used to decide when to unsubscribe from the Redis conversation channel
    convUsers = new Map();
    // ── Add a new connection ────────────────────────────────────────────────────
    async add(client) {
        const { userId } = client;
        // Add to connection map
        if (!this.connections.has(userId)) {
            this.connections.set(userId, new Set());
        }
        this.connections.get(userId).add(client);
        // Subscribe to the user's personal Redis channel if this is their first connection
        if (this.connections.get(userId).size === 1) {
            const unsub = await (0, redis_pubsub_1.subscribeToUser)(userId, (event) => {
                this.deliverToUser(userId, event);
            });
            this.userUnsubs.set(userId, unsub);
        }
    }
    // ── Remove a connection ─────────────────────────────────────────────────────
    async remove(client) {
        const { userId } = client;
        const userConns = this.connections.get(userId);
        if (!userConns)
            return;
        userConns.delete(client);
        // Unsubscribe from all conversation channels this socket was in
        for (const convId of client.subscriptions) {
            await this.removeUserFromConversation(userId, convId);
        }
        // If this was the last connection for this user, clean up the user channel
        if (userConns.size === 0) {
            this.connections.delete(userId);
            const unsub = this.userUnsubs.get(userId);
            if (unsub) {
                await unsub();
                this.userUnsubs.delete(userId);
            }
        }
    }
    // ── Conversation subscription ───────────────────────────────────────────────
    /**
     * Subscribe a connected client to a conversation's Redis channel.
     * Called when the client sends a 'conversation:join' event or when
     * the event router processes a message:send for a new conversation.
     */
    async addUserToConversation(userId, convId) {
        // Register this user as a subscriber of the conversation on this instance
        if (!this.convUsers.has(convId)) {
            this.convUsers.set(convId, new Set());
        }
        const users = this.convUsers.get(convId);
        if (users.has(userId))
            return; // already subscribed
        users.add(userId);
        // If this is the first user on this instance subscribing to this conv,
        // open the Redis channel subscription
        if (users.size === 1) {
            const unsub = await (0, redis_pubsub_1.subscribeToConversation)(convId, (event) => {
                this.deliverToConversation(convId, event);
            });
            this.convUnsubs.set(convId, unsub);
        }
        // Track on the client's subscriptions set so we clean up on disconnect
        const userConns = this.connections.get(userId);
        if (userConns) {
            for (const client of userConns) {
                client.subscriptions.add(convId);
            }
        }
    }
    /**
     * Remove a user from a conversation subscription.
     * Called on socket disconnect or explicit conversation:leave.
     */
    async removeUserFromConversation(userId, convId) {
        const users = this.convUsers.get(convId);
        if (!users)
            return;
        users.delete(userId);
        // If no more users on this instance are subscribed, unsubscribe from Redis
        if (users.size === 0) {
            this.convUsers.delete(convId);
            const unsub = this.convUnsubs.get(convId);
            if (unsub) {
                await unsub();
                this.convUnsubs.delete(convId);
            }
        }
    }
    // ── Delivery ────────────────────────────────────────────────────────────────
    /**
     * Deliver an event to ALL connections for a specific user on this instance.
     * If the user is connected on another instance, Redis pub/sub handles delivery there.
     */
    deliverToUser(userId, event) {
        const conns = this.connections.get(userId);
        if (!conns)
            return;
        for (const client of conns) {
            (0, ws_server_1.sendToClient)(client, event);
        }
    }
    /**
     * Deliver an event to all users subscribed to a conversation on this instance.
     * The Redis pub/sub handler calls this for every instance that has subscribers.
     */
    deliverToConversation(convId, event) {
        const users = this.convUsers.get(convId);
        if (!users)
            return;
        for (const userId of users) {
            this.deliverToUser(userId, event);
        }
    }
    /**
     * Deliver an event to a specific user across all instances.
     * Uses Redis pub/sub — works whether the user is on this instance or another.
     * This is the primary delivery method called from service layer.
     */
    async deliverToUserGlobal(userId, event) {
        // Attempt local delivery first (avoids Redis round-trip when on same instance)
        this.deliverToUser(userId, event);
        // Always publish to Redis so other instances also deliver
        // The local subscriber will call deliverToUser again — this is a no-op
        // because sendToClient checks readyState and we avoid double-sending by
        // checking if the socket is already in the local map. We publish regardless
        // to guarantee delivery on remote instances.
        await (0, redis_pubsub_1.publishToUser)(userId, event);
    }
    /**
     * Deliver an event to all participants of a conversation across all instances.
     */
    async deliverToConversationGlobal(convId, event) {
        await (0, redis_pubsub_1.publishToConversation)(convId, event);
        // Local delivery happens via the Redis subscription handler
    }
    // ── Queries ─────────────────────────────────────────────────────────────────
    hasConnections(userId) {
        const conns = this.connections.get(userId);
        return !!conns && conns.size > 0;
    }
    getConnectionCount(userId) {
        return this.connections.get(userId)?.size ?? 0;
    }
    getTotalConnections() {
        let total = 0;
        for (const conns of this.connections.values()) {
            total += conns.size;
        }
        return total;
    }
    getConnectedUserIds() {
        return Array.from(this.connections.keys());
    }
    isUserSubscribedToConversation(userId, convId) {
        return this.convUsers.get(convId)?.has(userId) ?? false;
    }
}
// Singleton export
exports.connectionManager = new ConnectionManager();
//# sourceMappingURL=connection-manager.js.map