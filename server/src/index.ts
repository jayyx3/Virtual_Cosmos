import "dotenv/config";
import cors from "cors";
import express from "express";
import type { Request, Response } from "express";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { Server } from "socket.io";
import { z } from "zod";
import { ChatMessageModel } from "./models/chatMessage.js";
import { connectMongo } from "./lib/db.js";
import { CLIENT_ORIGIN, PORT, PROXIMITY_RADIUS, WORLD_HEIGHT, WORLD_WIDTH } from "./constants.js";
import type { CosmosUser, SerializableUser } from "./types.js";

type TopicZone = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type ModerationReport = {
  id: string;
  reporterUserId: string;
  reporterName: string;
  targetUserId: string;
  targetName: string;
  reason: string;
  createdAt: number;
};

const TOPIC_ZONES: TopicZone[] = [
  { id: "blue-dock", name: "Blue Dock", x: 80, y: 80, width: 620, height: 420 },
  { id: "green-commons", name: "Green Commons", x: 820, y: 250, width: 540, height: 500 },
  { id: "terra-stage", name: "Terra Stage", x: 1500, y: 100, width: 560, height: 460 },
  { id: "north-grid", name: "North Grid", x: 1560, y: 720, width: 430, height: 300 }
];

const TRANSIT_TOPIC = { id: "transit", name: "Transit" };
const MESSAGE_WINDOW_MS = 7000;
const MESSAGE_LIMIT = 6;
const IDLE_TIMEOUT_MS = 35000;
const ADMIN_KEY = process.env.ADMIN_KEY ?? "";

const profanityWords = ["damn", "hell", "idiot", "stupid", "fool"];
const profanityRegex = new RegExp(`\\b(${profanityWords.join("|")})\\b`, "gi");

const joinPayloadSchema = z.object({
  name: z.string().trim().min(2).max(20),
  avatarColor: z.string().trim().min(4).max(30),
  inviteTopicId: z.string().trim().min(1).max(40).optional()
});

const movePayloadSchema = z.object({
  x: z.number().min(0).max(WORLD_WIDTH),
  y: z.number().min(0).max(WORLD_HEIGHT)
});

const messagePayloadSchema = z.object({
  toUserId: z.string().trim().min(1),
  message: z.string().trim().min(1).max(500)
});

const topicMessagePayloadSchema = z.object({
  message: z.string().trim().min(1).max(500)
});

const mediaPresenceSchema = z.object({
  micOn: z.boolean(),
  camOn: z.boolean(),
  speaking: z.boolean()
});

const blockPayloadSchema = z.object({
  targetUserId: z.string().trim().min(1),
  blocked: z.boolean().default(true)
});

const reportPayloadSchema = z.object({
  targetUserId: z.string().trim().min(1),
  reason: z.string().trim().min(4).max(180)
});

const adminActionSchema = z.object({
  adminKey: z.string().trim().min(1),
  action: z.enum(["mute", "unmute", "kick"]),
  targetUserId: z.string().trim().min(1),
  durationSeconds: z.number().int().min(10).max(1800).optional()
});

const rtcOfferSchema = z.object({
  toUserId: z.string().trim().min(1),
  sdp: z.object({
    type: z.enum(["offer", "answer", "pranswer", "rollback"]),
    sdp: z.string().optional()
  })
});

const rtcAnswerSchema = z.object({
  toUserId: z.string().trim().min(1),
  sdp: z.object({
    type: z.enum(["offer", "answer", "pranswer", "rollback"]),
    sdp: z.string().optional()
  })
});

const rtcIceSchema = z.object({
  toUserId: z.string().trim().min(1),
  candidate: z.object({
    candidate: z.string(),
    sdpMid: z.string().nullable().optional(),
    sdpMLineIndex: z.number().nullable().optional(),
    usernameFragment: z.string().nullable().optional()
  })
});

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

app.get("/", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: "virtual-cosmos-server",
    message: "Backend is running. Use /health for status and connect frontend on port 5173.",
    health: "/health"
  });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGIN }
});

const usersBySocket = new Map<string, CosmosUser>();
const usersById = new Map<string, CosmosUser>();
const moderationReports: ModerationReport[] = [];
let directMessagesTotal = 0;
let topicMessagesTotal = 0;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function distance(a: CosmosUser, b: CosmosUser): number {
  const dx = a.position.x - b.position.x;
  const dy = a.position.y - b.position.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function getTopicByPosition(position: { x: number; y: number }): { id: string; name: string } {
  for (const topic of TOPIC_ZONES) {
    const insideX = position.x >= topic.x && position.x <= topic.x + topic.width;
    const insideY = position.y >= topic.y && position.y <= topic.y + topic.height;
    if (insideX && insideY) {
      return { id: topic.id, name: topic.name };
    }
  }

  return TRANSIT_TOPIC;
}

function topicSpawnPosition(topicId?: string): { x: number; y: number } {
  const zone = TOPIC_ZONES.find((entry) => entry.id === topicId);
  if (!zone) {
    return {
      x: Math.floor(Math.random() * (WORLD_WIDTH - 100)) + 50,
      y: Math.floor(Math.random() * (WORLD_HEIGHT - 100)) + 50
    };
  }

  return {
    x: clamp(zone.x + Math.floor(Math.random() * zone.width), 0, WORLD_WIDTH),
    y: clamp(zone.y + Math.floor(Math.random() * zone.height), 0, WORLD_HEIGHT)
  };
}

function serializableUser(user: CosmosUser): SerializableUser {
  return {
    userId: user.userId,
    name: user.name,
    avatarColor: user.avatarColor,
    position: user.position,
    currentTopicId: user.currentTopicId,
    currentTopicName: user.currentTopicName,
    presence: user.presence,
    media: user.media
  };
}

function sanitizeMessage(input: string): string {
  return input.replace(profanityRegex, "***");
}

function canSendMessage(user: CosmosUser): boolean {
  const now = Date.now();

  if (user.mutedUntil > now) {
    const socket = io.sockets.sockets.get(user.socketId);
    socket?.emit("error:message", "You are temporarily muted by host moderation.");
    return false;
  }

  user.messageTimestamps = user.messageTimestamps.filter((time) => now - time <= MESSAGE_WINDOW_MS);
  if (user.messageTimestamps.length >= MESSAGE_LIMIT) {
    const socket = io.sockets.sockets.get(user.socketId);
    socket?.emit("error:message", "Rate limit reached. Please slow down your messages.");
    return false;
  }

  user.messageTimestamps.push(now);
  return true;
}

function emitTopicSummary(): void {
  const map = new Map<string, { topicId: string; topicName: string; occupancy: number }>();

  for (const user of usersById.values()) {
    const current = map.get(user.currentTopicId) ?? {
      topicId: user.currentTopicId,
      topicName: user.currentTopicName,
      occupancy: 0
    };
    current.occupancy += 1;
    map.set(user.currentTopicId, current);
  }

  io.emit("topic:summary", { topics: [...map.values()] });
}

function emitUserPresence(user: CosmosUser): void {
  io.emit("world:user_presence", {
    userId: user.userId,
    presence: user.presence,
    media: user.media,
    currentTopicId: user.currentTopicId,
    currentTopicName: user.currentTopicName
  });
}

function emitProximityFor(user: CosmosUser): void {
  const socket = io.sockets.sockets.get(user.socketId);
  if (!socket) return;

  const connectedUsers = [...user.connectedUserIds]
    .map((id) => usersById.get(id))
    .filter(Boolean)
    .map((entry) => serializableUser(entry as CosmosUser));

  socket.emit("proximity:update", {
    connectedUsers,
    connectedUserIds: [...user.connectedUserIds]
  });
}

function synchronizeConnection(a: CosmosUser, b: CosmosUser): void {
  const isClose = distance(a, b) < PROXIMITY_RADIUS;
  const wasConnected = a.connectedUserIds.has(b.userId);

  if (isClose && !wasConnected) {
    a.connectedUserIds.add(b.userId);
    b.connectedUserIds.add(a.userId);
    emitProximityFor(a);
    emitProximityFor(b);
    return;
  }

  if (!isClose && wasConnected) {
    a.connectedUserIds.delete(b.userId);
    b.connectedUserIds.delete(a.userId);
    emitProximityFor(a);
    emitProximityFor(b);
  }
}

function synchronizeUserConnections(user: CosmosUser): void {
  for (const other of usersById.values()) {
    if (other.userId === user.userId) continue;
    synchronizeConnection(user, other);
  }
}

function removeUser(user: CosmosUser): void {
  for (const otherId of user.connectedUserIds) {
    const other = usersById.get(otherId);
    if (!other) continue;
    other.connectedUserIds.delete(user.userId);
    emitProximityFor(other);
  }

  usersBySocket.delete(user.socketId);
  usersById.delete(user.userId);
  io.emit("world:user_left", { userId: user.userId });
  emitTopicSummary();
}

function maybeRequireAdminKey(key?: string): boolean {
  if (!ADMIN_KEY) return true;
  return key === ADMIN_KEY;
}

function activeConnectionsCount(): number {
  let pairs = 0;
  for (const user of usersById.values()) {
    pairs += user.connectedUserIds.size;
  }
  return Math.floor(pairs / 2);
}

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, usersOnline: usersById.size });
});

app.get("/admin/metrics", (req: Request, res: Response) => {
  const requestKey = (req.headers["x-admin-key"] as string | undefined) ?? (req.query.key as string | undefined);
  if (!maybeRequireAdminKey(requestKey)) {
    res.status(403).json({ ok: false, error: "Admin key mismatch" });
    return;
  }

  const topicMap = new Map<string, { topicId: string; topicName: string; occupancy: number }>();
  for (const user of usersById.values()) {
    const current = topicMap.get(user.currentTopicId) ?? {
      topicId: user.currentTopicId,
      topicName: user.currentTopicName,
      occupancy: 0
    };
    current.occupancy += 1;
    topicMap.set(user.currentTopicId, current);
  }

  const usersMuted = [...usersById.values()].filter((user) => user.mutedUntil > Date.now()).length;

  res.json({
    usersOnline: usersById.size,
    activeConnections: activeConnectionsCount(),
    activeCalls: activeConnectionsCount(),
    directMessagesTotal,
    topicMessagesTotal,
    usersMuted,
    reportsCount: moderationReports.length,
    topics: [...topicMap.values()].sort((a, b) => b.occupancy - a.occupancy),
    reportsPreview: moderationReports.slice(-10).reverse()
  });
});

io.on("connection", (socket) => {
  socket.on("world:join", (payload) => {
    const parsed = joinPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit("error:message", "Invalid join payload");
      return;
    }

    const spawnPosition = topicSpawnPosition(parsed.data.inviteTopicId);
    const topic = getTopicByPosition(spawnPosition);

    const user: CosmosUser = {
      userId: randomUUID(),
      socketId: socket.id,
      name: parsed.data.name,
      avatarColor: parsed.data.avatarColor,
      position: spawnPosition,
      currentTopicId: topic.id,
      currentTopicName: topic.name,
      presence: "active",
      media: { micOn: true, camOn: true, speaking: false },
      connectedUserIds: new Set<string>(),
      blockedUserIds: new Set<string>(),
      mutedUntil: 0,
      messageTimestamps: [],
      lastSeenAt: Date.now()
    };

    usersBySocket.set(socket.id, user);
    usersById.set(user.userId, user);

    socket.emit("world:init", {
      self: serializableUser(user),
      users: [...usersById.values()].map(serializableUser),
      world: {
        width: WORLD_WIDTH,
        height: WORLD_HEIGHT,
        proximityRadius: PROXIMITY_RADIUS
      }
    });

    socket.broadcast.emit("world:user_joined", { user: serializableUser(user) });
    synchronizeUserConnections(user);
    emitTopicSummary();
  });

  socket.on("world:move", (payload) => {
    const parsed = movePayloadSchema.safeParse(payload);
    if (!parsed.success) return;

    const user = usersBySocket.get(socket.id);
    if (!user) return;

    user.position = parsed.data;
    user.lastSeenAt = Date.now();

    if (user.presence !== "active") {
      user.presence = "active";
      emitUserPresence(user);
    }

    const previousTopicId = user.currentTopicId;
    const topic = getTopicByPosition(user.position);
    user.currentTopicId = topic.id;
    user.currentTopicName = topic.name;

    io.emit("world:user_moved", {
      userId: user.userId,
      position: user.position
    });

    if (previousTopicId !== user.currentTopicId) {
      emitUserPresence(user);
      emitTopicSummary();
    }

    synchronizeUserConnections(user);
  });

  socket.on("presence:media", (payload) => {
    const parsed = mediaPresenceSchema.safeParse(payload);
    if (!parsed.success) return;

    const user = usersBySocket.get(socket.id);
    if (!user) return;

    user.media = parsed.data;
    user.lastSeenAt = Date.now();
    if (user.presence !== "active") {
      user.presence = "active";
    }

    emitUserPresence(user);
  });

  socket.on("chat:send", async (payload) => {
    const parsed = messagePayloadSchema.safeParse(payload);
    if (!parsed.success) return;

    const sender = usersBySocket.get(socket.id);
    if (!sender || !canSendMessage(sender)) return;

    if (!sender.connectedUserIds.has(parsed.data.toUserId)) {
      socket.emit("error:message", "Target user is out of proximity");
      return;
    }

    const receiver = usersById.get(parsed.data.toUserId);
    if (!receiver) return;

    if (sender.blockedUserIds.has(receiver.userId)) {
      socket.emit("error:message", "You blocked this user. Unblock to send messages.");
      return;
    }

    if (receiver.blockedUserIds.has(sender.userId)) {
      socket.emit("error:message", "Message rejected: this user blocked you.");
      return;
    }

    const message = {
      id: randomUUID(),
      fromUserId: sender.userId,
      toUserId: receiver.userId,
      message: sanitizeMessage(parsed.data.message),
      sentAt: Date.now()
    };

    directMessagesTotal += 1;

    socket.emit("chat:message", message);
    io.to(receiver.socketId).emit("chat:message", message);

    if (process.env.MONGODB_URI) {
      ChatMessageModel.create({
        fromUserId: message.fromUserId,
        toUserId: message.toUserId,
        message: message.message,
        sentAt: new Date(message.sentAt)
      }).catch((error: unknown) => {
        console.error("[db] failed to store chat message", error);
      });
    }
  });

  socket.on("topic:send", (payload) => {
    const parsed = topicMessagePayloadSchema.safeParse(payload);
    if (!parsed.success) return;

    const sender = usersBySocket.get(socket.id);
    if (!sender || !canSendMessage(sender)) return;

    const topicMessage = {
      id: randomUUID(),
      fromUserId: sender.userId,
      fromUserName: sender.name,
      topicId: sender.currentTopicId,
      topicName: sender.currentTopicName,
      message: sanitizeMessage(parsed.data.message),
      sentAt: Date.now()
    };

    topicMessagesTotal += 1;

    for (const candidate of usersById.values()) {
      if (candidate.currentTopicId !== sender.currentTopicId) continue;
      if (candidate.blockedUserIds.has(sender.userId)) continue;
      io.to(candidate.socketId).emit("topic:message", topicMessage);
    }
  });

  socket.on("moderation:block", (payload) => {
    const parsed = blockPayloadSchema.safeParse(payload);
    if (!parsed.success) return;

    const sender = usersBySocket.get(socket.id);
    if (!sender) return;

    const target = usersById.get(parsed.data.targetUserId);
    if (!target) return;

    if (parsed.data.blocked) {
      sender.blockedUserIds.add(target.userId);
    } else {
      sender.blockedUserIds.delete(target.userId);
    }

    socket.emit("moderation:block_ack", {
      targetUserId: target.userId,
      blocked: parsed.data.blocked
    });
  });

  socket.on("moderation:report", (payload) => {
    const parsed = reportPayloadSchema.safeParse(payload);
    if (!parsed.success) return;

    const reporter = usersBySocket.get(socket.id);
    if (!reporter) return;

    const target = usersById.get(parsed.data.targetUserId);
    if (!target) return;

    const report: ModerationReport = {
      id: randomUUID(),
      reporterUserId: reporter.userId,
      reporterName: reporter.name,
      targetUserId: target.userId,
      targetName: target.name,
      reason: sanitizeMessage(parsed.data.reason),
      createdAt: Date.now()
    };

    moderationReports.push(report);
    socket.emit("moderation:report_ack", { ok: true });
  });

  socket.on("moderation:admin_action", (payload) => {
    const parsed = adminActionSchema.safeParse(payload);
    if (!parsed.success) return;
    if (!maybeRequireAdminKey(parsed.data.adminKey)) {
      socket.emit("error:message", "Invalid admin key");
      return;
    }

    const target = usersById.get(parsed.data.targetUserId);
    if (!target) return;

    if (parsed.data.action === "kick") {
      const targetSocket = io.sockets.sockets.get(target.socketId);
      targetSocket?.emit("error:message", "You were removed by host moderation.");
      targetSocket?.disconnect(true);
      return;
    }

    if (parsed.data.action === "mute") {
      const durationMs = (parsed.data.durationSeconds ?? 120) * 1000;
      target.mutedUntil = Date.now() + durationMs;
      io.to(target.socketId).emit("error:message", "You were temporarily muted by host moderation.");
      return;
    }

    target.mutedUntil = 0;
    io.to(target.socketId).emit("error:message", "Your mute was lifted by host moderation.");
  });

  socket.on("webrtc:offer", (payload) => {
    const parsed = rtcOfferSchema.safeParse(payload);
    if (!parsed.success) return;

    const sender = usersBySocket.get(socket.id);
    if (!sender) return;
    if (!sender.connectedUserIds.has(parsed.data.toUserId)) return;

    const receiver = usersById.get(parsed.data.toUserId);
    if (!receiver) return;
    if (receiver.blockedUserIds.has(sender.userId)) return;

    io.to(receiver.socketId).emit("webrtc:offer", {
      fromUserId: sender.userId,
      sdp: parsed.data.sdp
    });
  });

  socket.on("webrtc:answer", (payload) => {
    const parsed = rtcAnswerSchema.safeParse(payload);
    if (!parsed.success) return;

    const sender = usersBySocket.get(socket.id);
    if (!sender) return;
    if (!sender.connectedUserIds.has(parsed.data.toUserId)) return;

    const receiver = usersById.get(parsed.data.toUserId);
    if (!receiver) return;
    if (receiver.blockedUserIds.has(sender.userId)) return;

    io.to(receiver.socketId).emit("webrtc:answer", {
      fromUserId: sender.userId,
      sdp: parsed.data.sdp
    });
  });

  socket.on("webrtc:ice-candidate", (payload) => {
    const parsed = rtcIceSchema.safeParse(payload);
    if (!parsed.success) return;

    const sender = usersBySocket.get(socket.id);
    if (!sender) return;
    if (!sender.connectedUserIds.has(parsed.data.toUserId)) return;

    const receiver = usersById.get(parsed.data.toUserId);
    if (!receiver) return;
    if (receiver.blockedUserIds.has(sender.userId)) return;

    io.to(receiver.socketId).emit("webrtc:ice-candidate", {
      fromUserId: sender.userId,
      candidate: parsed.data.candidate
    });
  });

  socket.on("disconnect", () => {
    const user = usersBySocket.get(socket.id);
    if (!user) return;
    removeUser(user);
  });
});

setInterval(() => {
  const now = Date.now();

  for (const user of usersById.values()) {
    const nextPresence = now - user.lastSeenAt > IDLE_TIMEOUT_MS ? "idle" : "active";
    if (user.presence !== nextPresence) {
      user.presence = nextPresence;
      emitUserPresence(user);
    }
  }
}, 5000);

async function start(): Promise<void> {
  await connectMongo();

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(PORT, () => {
      httpServer.off("error", reject);
      console.log(`[server] listening on http://localhost:${PORT}`);
      console.log(`[server] allowed client origin: ${CLIENT_ORIGIN}`);
      resolve();
    });
  });
}

start().catch((error) => {
  if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "EADDRINUSE") {
    console.error(`[server] Port ${PORT} is already in use. Stop the existing process or set a different PORT in server/.env.`);
  } else {
    console.error("Failed to start server", error);
  }
  process.exit(1);
});
