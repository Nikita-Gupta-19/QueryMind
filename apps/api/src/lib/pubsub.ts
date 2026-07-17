import Redis from 'ioredis';
import { Server as SocketIOServer } from 'socket.io';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Separate connections for publishing and subscribing (required by Redis)
const pubClient = new Redis(redisUrl);
let subClient: Redis | null = null;

/**
 * Publish a socket event to the Redis bridge.
 * Any running API process will pick this up and broadcast it via Socket.IO.
 */
export async function publishSocketEvent(room: string, event: string, data: any): Promise<void> {
  try {
    const payload = JSON.stringify({ room, event, data });
    await pubClient.publish('socket-bridge', payload);
  } catch (err) {
    console.error('[PubSub] Failed to publish socket event:', err);
  }
}

/**
 * Initialize the Socket.IO bridge on the subscriber client.
 * Listens to Redis pub/sub and emits events locally.
 */
export function initSocketBridge(io: SocketIOServer): void {
  if (subClient) return;
  
  subClient = new Redis(redisUrl);
  
  subClient.subscribe('socket-bridge', (err) => {
    if (err) {
      console.error('[PubSub] Failed to subscribe to socket-bridge channel:', err);
    } else {
      console.log('[PubSub] Successfully subscribed to socket-bridge channel');
    }
  });

  subClient.on('message', (channel, message) => {
    if (channel === 'socket-bridge') {
      try {
        const { room, event, data } = JSON.parse(message);
        io.to(room).emit(event, data);
      } catch (err) {
        console.error('[PubSub] Error processing Redis pub/sub message:', err);
      }
    }
  });
}
