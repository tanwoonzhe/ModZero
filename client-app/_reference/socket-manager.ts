/**
 * Socket.IO connection manager.
 *
 * Maintains a persistent connection to the controller for real-time events
 * such as policy updates, resource changes, and force-disconnect commands.
 */

import { io, Socket } from 'socket.io-client';
import { logger } from './logger';

let socket: Socket | null = null;
let connected = false;

interface SioCallbacks {
  onResourcesUpdate?: (resources: any[]) => void;
  onForceLogout?: () => void;
  onPolicyChange?: () => void;
}

let callbacks: SioCallbacks = {};

export function initSocketIO(serverUrl: string, token: string, cbs: SioCallbacks): void {
  callbacks = cbs;

  if (socket) {
    socket.disconnect();
  }

  socket = io(serverUrl, {
    transports: ['websocket', 'polling'],
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 30000,
  });

  socket.on('connect', () => {
    connected = true;
    logger.info('Socket.IO connected to controller');
    // Join the client room
    socket?.emit('client_join', { token });
  });

  socket.on('disconnect', (reason) => {
    connected = false;
    logger.warn(`Socket.IO disconnected: ${reason}`);
  });

  socket.on('connect_error', (err) => {
    logger.debug(`Socket.IO connection error: ${err.message}`);
  });

  // Real-time events from controller
  socket.on('resources_updated', (data: any) => {
    logger.info('Received resources_updated event');
    callbacks.onResourcesUpdate?.(data.resources || []);
  });

  socket.on('force_logout', () => {
    logger.warn('Received force_logout from controller');
    callbacks.onForceLogout?.();
  });

  socket.on('policy_changed', () => {
    logger.info('Received policy_changed event');
    callbacks.onPolicyChange?.();
  });
}

export function disconnectSocketIO(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
    connected = false;
    logger.info('Socket.IO disconnected (manual)');
  }
}

export function isSocketConnected(): boolean {
  return connected;
}

export function getSocketId(): string {
  return socket?.id || '';
}
