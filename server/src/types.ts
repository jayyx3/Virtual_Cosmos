export type Position = {
  x: number;
  y: number;
};

export type PresenceState = "active" | "idle";

export type MediaState = {
  micOn: boolean;
  camOn: boolean;
  speaking: boolean;
};

export type CosmosUser = {
  userId: string;
  socketId: string;
  name: string;
  avatarColor: string;
  position: Position;
  currentTopicId: string;
  currentTopicName: string;
  presence: PresenceState;
  media: MediaState;
  connectedUserIds: Set<string>;
  blockedUserIds: Set<string>;
  mutedUntil: number;
  messageTimestamps: number[];
  lastSeenAt: number;
};

export type SerializableUser = {
  userId: string;
  name: string;
  avatarColor: string;
  position: Position;
  currentTopicId: string;
  currentTopicName: string;
  presence: PresenceState;
  media: MediaState;
};

export type ChatMessage = {
  id: string;
  fromUserId: string;
  toUserId: string;
  message: string;
  sentAt: number;
};
