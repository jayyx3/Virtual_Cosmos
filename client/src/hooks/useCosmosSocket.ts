import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { useCosmosStore } from "../store/useCosmosStore";
import type {
  AdminMetrics,
  ChatMessage,
  CosmosUser,
  MediaState,
  Position,
  TopicMessage,
  TopicSummary,
  WorldConfig
} from "../types";

type InitPayload = {
  self: CosmosUser;
  users: CosmosUser[];
  world: WorldConfig;
};

type ProximityPayload = {
  connectedUserIds: string[];
  connectedUsers: CosmosUser[];
};

const serverUrl = import.meta.env.VITE_SERVER_URL ?? "http://localhost:4000";

export function useCosmosSocket(isJoined: boolean) {
  const socketRef = useRef<Socket | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  const {
    name,
    avatarColor,
    initializeWorld,
    setUser,
    removeUser,
    updateUserPosition,
    updateUserPresence,
    setProximity,
    addMessage,
    addTopicMessage,
    setTopicSummaries,
    setBlocked,
    setLastError
  } = useCosmosStore();

  useEffect(() => {
    if (!isJoined || !name) return;

    const socket = io(serverUrl, {
      transports: ["websocket"]
    });

    socketRef.current = socket;
    setSocket(socket);

    socket.on("connect", () => {
      setLastError("");
      const params = new URLSearchParams(window.location.search);
      const inviteTopicId = params.get("topic") ?? undefined;
      socket.emit("world:join", { name, avatarColor, inviteTopicId });
    });

    socket.on("connect_error", () => {
      setLastError("Could not connect to server. Make sure backend is running on port 4000.");
    });

    socket.on("world:init", (payload: InitPayload) => {
      initializeWorld(payload);
    });

    socket.on("world:user_joined", ({ user }: { user: CosmosUser }) => {
      setUser(user);
    });

    socket.on("world:user_moved", ({ userId, position }: { userId: string; position: Position }) => {
      updateUserPosition(userId, position);
    });

    socket.on(
      "world:user_presence",
      ({
        userId,
        presence,
        media,
        currentTopicId,
        currentTopicName
      }: {
        userId: string;
        presence: CosmosUser["presence"];
        media: MediaState;
        currentTopicId: string;
        currentTopicName: string;
      }) => {
        updateUserPresence(userId, { presence, media, currentTopicId, currentTopicName });
      }
    );

    socket.on("world:user_left", ({ userId }: { userId: string }) => {
      removeUser(userId);
    });

    socket.on("proximity:update", (payload: ProximityPayload) => {
      setProximity(payload.connectedUserIds, payload.connectedUsers);
    });

    socket.on("chat:message", (payload: ChatMessage) => {
      addMessage(payload);
    });

    socket.on("topic:message", (payload: TopicMessage) => {
      addTopicMessage(payload);
    });

    socket.on("topic:summary", ({ topics }: { topics: TopicSummary[] }) => {
      setTopicSummaries(topics);
    });

    socket.on("moderation:block_ack", ({ targetUserId, blocked }: { targetUserId: string; blocked: boolean }) => {
      setBlocked(targetUserId, blocked);
    });

    socket.on("error:message", (message: string) => {
      setLastError(message);
    });

    return () => {
      socket.off("connect_error");
      socket.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, [
    addMessage,
    addTopicMessage,
    avatarColor,
    initializeWorld,
    isJoined,
    name,
    removeUser,
    setBlocked,
    setLastError,
    setProximity,
    setTopicSummaries,
    setUser,
    updateUserPosition,
    updateUserPresence
  ]);

  return useMemo(
    () => ({
      socket,
      sendMove: (position: Position) => {
        socketRef.current?.emit("world:move", position);
      },
      sendMessage: (toUserId: string, message: string) => {
        socketRef.current?.emit("chat:send", { toUserId, message });
      },
      sendTopicMessage: (message: string) => {
        socketRef.current?.emit("topic:send", { message });
      },
      updateMediaPresence: (media: MediaState) => {
        socketRef.current?.emit("presence:media", media);
      },
      blockUser: (targetUserId: string, blocked: boolean) => {
        socketRef.current?.emit("moderation:block", { targetUserId, blocked });
      },
      reportUser: (targetUserId: string, reason: string) => {
        socketRef.current?.emit("moderation:report", { targetUserId, reason });
      },
      adminAction: (adminKey: string, action: "mute" | "unmute" | "kick", targetUserId: string, durationSeconds?: number) => {
        socketRef.current?.emit("moderation:admin_action", { adminKey, action, targetUserId, durationSeconds });
      },
      fetchAdminMetrics: async (adminKey: string): Promise<AdminMetrics | null> => {
        try {
          const response = await fetch(`${serverUrl}/admin/metrics?key=${encodeURIComponent(adminKey)}`);
          if (!response.ok) return null;
          return (await response.json()) as AdminMetrics;
        } catch {
          return null;
        }
      }
    }),
    [socket]
  );
}
