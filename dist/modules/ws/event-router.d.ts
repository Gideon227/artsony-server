import type { WsClient } from '../../common/types';
declare class EventRouter {
    /**
     * Entry point for every raw message arriving from a WebSocket client.
     * Responsibilities:
     *   1. Parse and narrow the event type
     *   2. Apply per-user rate limiting
     *   3. Validate the payload shape
     *   4. Dispatch to the appropriate handler
     *   5. Return typed error events on any failure
     */
    handle(client: WsClient, raw: unknown): Promise<void>;
    private handleSendMessage;
    private handleMarkRead;
    private handleTypingStart;
    private handleTypingStop;
    private handleJoinConversation;
    private handlePing;
    private error;
}
export declare const eventRouter: EventRouter;
export {};
//# sourceMappingURL=event-router.d.ts.map