import { useEffect, useRef, useState } from "react";
import { connectSocket, disconnectSocket, getSocket } from "../services/socketService";

/**
 * React hook that connects to the Socket.IO server and subscribes to an event.
 *
 * @param eventName  The Socket.IO event to listen for (e.g. "access_attempt").
 * @param onEvent    Callback invoked with the event payload.
 * @returns          `{ isConnected }` — whether the socket is currently connected.
 *
 * Usage:
 * ```tsx
 * const { isConnected } = useSocket("access_attempt", (data) => {
 *   setAttempts((prev) => [data, ...prev]);
 * });
 * ```
 */
export function useSocket<T = any>(
  eventName: string,
  onEvent: (data: T) => void,
): { isConnected: boolean } {
  const [isConnected, setIsConnected] = useState(false);
  // Keep a stable reference to the latest callback
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    const socket = getSocket();

    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);
    const handleEvent = (data: T) => callbackRef.current(data);

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on(eventName, handleEvent);

    // Set initial state
    setIsConnected(socket.connected);

    // Connect if not already
    connectSocket();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off(eventName, handleEvent);
    };
  }, [eventName]);

  return { isConnected };
}

/**
 * Hook that only tracks Socket.IO connection state (no specific event).
 */
export function useSocketConnection(): { isConnected: boolean } {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socket = getSocket();

    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    setIsConnected(socket.connected);
    connectSocket();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
    };
  }, []);

  return { isConnected };
}
