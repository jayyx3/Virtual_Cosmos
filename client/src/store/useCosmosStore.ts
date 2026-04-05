import { create } from "zustand";
import type {
  ChatMessage,
  CosmosUser,
  MediaState,
  Position,
  PresenceState,
  TopicMessage,
  TopicSummary,
  WorldConfig
} from "../types";

type CosmosState = {
  name: string;
  avatarColor: string;
  self: CosmosUser | null;
  users: Record<string, CosmosUser>;
  connectedUserIds: string[];
  connectedUsers: CosmosUser[];
  messagesByPeer: Record<string, ChatMessage[]>;
  topicMessagesById: Record<string, TopicMessage[]>;
  topicSummaries: TopicSummary[];
  blockedUserIds: string[];
  lastError: string;
  world: WorldConfig;
  setProfile: (name: string, avatarColor: string) => void;
  initializeWorld: (payload: { self: CosmosUser; users: CosmosUser[]; world: WorldConfig }) => void;
  setUser: (user: CosmosUser) => void;
  removeUser: (userId: string) => void;
  updateUserPosition: (userId: string, position: Position) => void;
  updateUserPresence: (
    userId: string,
    payload: {
      presence: PresenceState;
      media: MediaState;
      currentTopicId: string;
      currentTopicName: string;
    }
  ) => void;
  setProximity: (connectedUserIds: string[], connectedUsers: CosmosUser[]) => void;
  addMessage: (message: ChatMessage) => void;
  addTopicMessage: (message: TopicMessage) => void;
  setTopicSummaries: (topics: TopicSummary[]) => void;
  setBlocked: (targetUserId: string, blocked: boolean) => void;
  setLastError: (message: string) => void;
};

const defaultWorld: WorldConfig = {
  width: 2200,
  height: 1400,
  proximityRadius: 220
};

export const useCosmosStore = create<CosmosState>((set, get) => ({
  name: "",
  avatarColor: "#ff7a18",
  self: null,
  users: {},
  connectedUserIds: [],
  connectedUsers: [],
  messagesByPeer: {},
  topicMessagesById: {},
  topicSummaries: [],
  blockedUserIds: [],
  lastError: "",
  world: defaultWorld,
  setProfile: (name, avatarColor) => set({ name, avatarColor }),
  initializeWorld: ({ self, users, world }) => {
    const mapped: Record<string, CosmosUser> = {};
    for (const user of users) {
      mapped[user.userId] = user;
    }

    set({ self, users: mapped, world });
  },
  setUser: (user) =>
    set((state) => ({
      users: {
        ...state.users,
        [user.userId]: user
      }
    })),
  removeUser: (userId) =>
    set((state) => {
      const cloned = { ...state.users };
      delete cloned[userId];

      const { [userId]: _removed, ...messageRest } = state.messagesByPeer;

      return {
        users: cloned,
        connectedUserIds: state.connectedUserIds.filter((id) => id !== userId),
        connectedUsers: state.connectedUsers.filter((user) => user.userId !== userId),
        messagesByPeer: messageRest,
        blockedUserIds: state.blockedUserIds.filter((id) => id !== userId)
      };
    }),
  updateUserPosition: (userId, position) =>
    set((state) => {
      const user = state.users[userId];
      if (!user) return state;

      const updated = {
        ...user,
        position
      };

      return {
        self: state.self?.userId === userId ? updated : state.self,
        users: {
          ...state.users,
          [userId]: updated
        }
      };
    }),
  updateUserPresence: (userId, payload) =>
    set((state) => {
      const user = state.users[userId];
      if (!user) return state;

      const updated = {
        ...user,
        presence: payload.presence,
        media: payload.media,
        currentTopicId: payload.currentTopicId,
        currentTopicName: payload.currentTopicName
      };

      return {
        self: state.self?.userId === userId ? updated : state.self,
        users: {
          ...state.users,
          [userId]: updated
        }
      };
    }),
  setProximity: (connectedUserIds, connectedUsers) => set({ connectedUserIds, connectedUsers }),
  addMessage: (message) => {
    const { self } = get();
    if (!self) return;

    const peerId = message.fromUserId === self.userId ? message.toUserId : message.fromUserId;

    set((state) => ({
      messagesByPeer: {
        ...state.messagesByPeer,
        [peerId]: [...(state.messagesByPeer[peerId] ?? []), message]
      }
    }));
  },
  addTopicMessage: (message) =>
    set((state) => ({
      topicMessagesById: {
        ...state.topicMessagesById,
        [message.topicId]: [...(state.topicMessagesById[message.topicId] ?? []), message]
      }
    })),
  setTopicSummaries: (topics) => set({ topicSummaries: topics }),
  setBlocked: (targetUserId, blocked) =>
    set((state) => {
      if (blocked && state.blockedUserIds.includes(targetUserId)) return state;
      if (!blocked && !state.blockedUserIds.includes(targetUserId)) return state;

      return {
        blockedUserIds: blocked
          ? [...state.blockedUserIds, targetUserId]
          : state.blockedUserIds.filter((userId) => userId !== targetUserId)
      };
    }),
  setLastError: (message) => set({ lastError: message })
}));
