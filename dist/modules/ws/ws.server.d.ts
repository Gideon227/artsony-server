import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'http';
import type { WsServerEvent } from '../../common/types';
/**
 * Attach the WebSocket server to the existing HTTP server.
 * Call this ONCE from server.ts after app.listen() resolves.
 *
 * We use { noServer: true } so we control the upgrade handshake ourselves —
 * this lets us authenticate BEFORE the WebSocket connection is established.
 * If auth fails we can return a proper HTTP 401 rather than opening a socket
 * and then immediately closing it.
 */
export declare function createWsServer(httpServer: HttpServer): WebSocketServer;
/**
 * Send a typed event to a single WebSocket client.
 * Silently drops if the socket is not in OPEN state.
 */
export declare function sendToClient(client: WebSocket, event: WsServerEvent): void;
export declare function getWss(): WebSocketServer | null;
//# sourceMappingURL=ws.server.d.ts.map