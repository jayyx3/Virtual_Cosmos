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

export type WorldConfig = {
  width: number;
  height: number;
  proximityRadius: number;
};

export type CosmosUser = {
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

export type TopicMessage = {
  id: string;
  fromUserId: string;
  fromUserName: string;
  topicId: string;
  topicName: string;
  message: string;
  sentAt: number;
};

export type TopicSummary = {
  topicId: string;
  topicName: string;
  occupancy: number;
};

export type AdminMetrics = {
  usersOnline: number;
  activeConnections: number;
  activeCalls: number;
  directMessagesTotal: number;
  topicMessagesTotal: number;
  usersMuted: number;
  reportsCount: number;
  topics: TopicSummary[];
  reportsPreview: Array<{
    id: string;
    reporterName: string;
    targetName: string;
    reason: string;
    createdAt: number;
  }>;
};
