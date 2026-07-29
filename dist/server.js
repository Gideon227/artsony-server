"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("http");
const app_1 = require("./app");
const ws_server_1 = require("./modules/ws/ws.server");
const redis_pubsub_1 = require("./modules/redis/redis.pubsub");
const redis_client_1 = require("./modules/redis/redis.client");
require("./modules/order/jobs/order-confirmation-timeout.job");
const config_1 = require("./config");
const app = (0, app_1.createApp)();
const httpServer = (0, http_1.createServer)(app);
async function start() {
    // ── Redis connectivity check 
    try {
        await (0, redis_client_1.getRedis)().ping();
        console.log('[Redis] Connected');
    }
    catch (err) {
        console.error('[Redis] Connection failed:', err);
        process.exit(1);
    }
    // ── Register recurring background jobs
    // if (config.env !== 'test') {
    //   await startExpireScheduler()
    // }
    // ── Attach WebSocket server
    // Must be called BEFORE httpServer.listen so the upgrade event listener
    // is registered before any connections arrive.
    (0, ws_server_1.createWsServer)(httpServer);
    // ── Start HTTP server 
    httpServer.listen(config_1.config.port, () => {
        console.log(`[Server] HTTP + WS running on port ${config_1.config.port} (${config_1.config.env})`);
        console.log(`[Server] WebSocket endpoint: ws://localhost:${config_1.config.port}/ws`);
    });
    // ── Graceful shutdown ──────────────────────────────────────────────────────
    const shutdown = async (signal) => {
        console.log(`[Server] ${signal} received — shutting down gracefully`);
        // Stop accepting new HTTP and WS connections
        httpServer.close(async () => {
            try {
                // Close Redis pub/sub subscriber cleanly so in-flight messages drain
                await (0, redis_pubsub_1.closePubSub)();
                // Disconnect the shared Redis client
                (0, redis_client_1.getRedis)().disconnect();
                console.log('[Server] Closed cleanly');
                process.exit(0);
            }
            catch (err) {
                console.error('[Server] Error during shutdown:', err);
                process.exit(1);
            }
        });
        // Force-exit after 10s if connections don't drain
        setTimeout(() => {
            console.error('[Server] Forced exit after timeout');
            process.exit(1);
        }, 10_000).unref();
    };
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
}
start().catch((err) => {
    console.error('[Server] Failed to start:', err);
    process.exit(1);
});
//# sourceMappingURL=server.js.map