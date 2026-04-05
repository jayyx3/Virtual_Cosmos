import type { CosmosUser, TopicSummary } from "../types";

type Props = {
  self: CosmosUser | null;
  connectedUsers: CosmosUser[];
  users: CosmosUser[];
  currentZoneName: string;
  topicSummaries: TopicSummary[];
  onCopyInvite: () => void;
  inviteCopied: boolean;
};

function presenceLabel(user: CosmosUser): string {
  const state = user.presence === "idle" ? "Idle" : "Active";
  const mic = user.media?.micOn ? "Mic On" : "Mic Off";
  const cam = user.media?.camOn ? "Cam On" : "Cam Off";
  const voice = user.media?.speaking ? "Speaking" : "Silent";
  return `${state} | ${mic} | ${cam} | ${voice}`;
}

export function Hud({ self, connectedUsers, users, currentZoneName, topicSummaries, onCopyInvite, inviteCopied }: Props) {
  const activeUsers = users.filter((user) => user.presence === "active").length;

  return (
    <aside className="hud-panel">
      <h1>Virtual Cosmos</h1>
      <p>Move with WASD or Arrow keys. Chat, voice, and video unlock when users enter your radius.</p>
      <div className="hud-cards">
        <div className="hud-card">
          <span>Logged in</span>
          <strong>{self?.name ?? "Guest"}</strong>
        </div>
        <div className="hud-card">
          <span>Online users</span>
          <strong>{users.length}</strong>
        </div>
        <div className="hud-card">
          <span>Active now</span>
          <strong>{activeUsers}</strong>
        </div>
        <div className="hud-card">
          <span>Active connections</span>
          <strong>{connectedUsers.length}</strong>
        </div>
        <div className="hud-card">
          <span>Current topic</span>
          <strong>{currentZoneName}</strong>
        </div>
      </div>

      <button type="button" className="invite-button" onClick={onCopyInvite}>
        {inviteCopied ? "Invite Link Copied" : "Copy Invite Link"}
      </button>

      {!!topicSummaries.length && (
        <section className="topic-summary">
          <h2>Topics</h2>
          {topicSummaries.map((topic) => (
            <p key={topic.topicId}>
              {topic.topicName}: {topic.occupancy}
            </p>
          ))}
        </section>
      )}

      <ul className="user-list">
        {users.map((user) => (
          <li key={user.userId}>
            <div className="user-row-main">
              <span className="dot" style={{ background: user.avatarColor }} />
              <strong>{user.name}</strong>
            </div>
            <small>{user.currentTopicName ?? "Transit"}</small>
            <small>{presenceLabel(user)}</small>
          </li>
        ))}
      </ul>
    </aside>
  );
}
