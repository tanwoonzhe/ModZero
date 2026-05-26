/**
 * Socket.IO service for real-time dashboard updates.
 *
 * Connects to the backend Socket.IO server and joins the "dashboard" room
 * to receive events such as access attempts and connector status changes.
 */

import { io, Socket } from "socket.io-client";

// Derive Socket.IO URL from env vars.
// VITE_SOCKET_URL takes precedence; fall back to the API base URL's origin.
function getSocketUrl(): string {
  const explicit = (import.meta as any).env?.VITE_SOCKET_URL;
  if (explicit) return explicit;

  const apiBase: string =
    (import.meta as any).env?.VITE_API_BASE || "http://localhost:8000/api";
  // Strip "/api" suffix to get the server origin.
  // For relative URLs like "/api" (production nginx deployment), use the
  // current page origin so Socket.IO connects to the same host.
  try {
    const url = new URL(apiBase);
    return url.origin;
  } catch {
    return window.location.origin;
  }
}

let socket: Socket | null = null;

/** Get (or create) the singleton socket instance. */
export function getSocket(): Socket {
  if (!socket) {
    const url = getSocketUrl();
    socket = io(url, {
      path: "/socket.io/socket.io",
      transports: ["websocket", "polling"],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    socket.on("connect", () => {
      console.log("[socket] connected:", socket?.id);
      // Join the dashboard room so we receive broadcast events
      socket?.emit("dashboard_join", {});
    });

    socket.on("disconnect", (reason) => {
      console.log("[socket] disconnected:", reason);
    });

    socket.on("connect_error", (err) => {
      console.warn("[socket] connection error:", err.message);
    });
  }
  return socket;
}

/** Connect (no-op if already connected). */
export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) s.connect();
}

/** Disconnect and reset. */
export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
