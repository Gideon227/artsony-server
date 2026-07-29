import type { WsClient, WsServerEvent } from '../../common/types';
declare class ConnectionManager {
    private readonly connections;
    private readonly userUnsubs;
    private readonly convUnsubs;
    private readonly convUsers;
    add(client: WsClient): Promise<void>;
    remove(client: WsClient): Promise<void>;
    /**
     * Subscribe a connected client to a conversation's Redis channel.
     * Called when the client sends a 'conversation:join' event or when
     * the event router processes a message:send for a new conversation.
     */
    addUserToConversation(userId: string, convId: string): Promise<void>;
    /**
     * Remove a user from a conversation subscription.
     * Called on socket disconnect or explicit conversation:leave.
     */
    removeUserFromConversation(userId: string, convId: string): Promise<void>;
    /**
     * Deliver an event to ALL connections for a specific user on this instance.
     * If the user is connected on another instance, Redis pub/sub handles delivery there.
     */
    deliverToUser(userId: string, event: WsServerEvent): void;
    /**
     * Deliver an event to all users subscribed to a conversation on this instance.
     * The Redis pub/sub handler calls this for every instance that has subscribers.
     */
    deliverToConversation(convId: string, event: WsServerEvent): void;
    /**
     * Deliver an event to a specific user across all instances.
     * Uses Redis pub/sub — works whether the user is on this instance or another.
     * This is the primary delivery method called from service layer.
     */
    deliverToUserGlobal(userId: string, event: WsServerEvent): Promise<void>;
    /**
     * Deliver an event to all participants of a conversation across all instances.
     */
    deliverToConversationGlobal(convId: string, event: WsServerEvent): Promise<void>;
    hasConnections(userId: string): boolean;
    getConnectionCount(userId: string): number;
    getTotalConnections(): number;
    getConnectedUserIds(): string[];
    isUserSubscribedToConversation(userId: string, convId: string): boolean;
}
export declare const connectionManager: ConnectionManager;
export {};
//# sourceMappingURL=connection-manager.d.ts.map