import { useEffect, useMemo, useState } from "react";
import { useCosmosStore } from "../store/useCosmosStore";
import type { CosmosUser } from "../types";

type Props = {
  self: CosmosUser | null;
  connectedUsers: CosmosUser[];
  onSend: (toUserId: string, message: string) => void;
  onSendTopic: (message: string) => void;
  onBlockUser: (targetUserId: string, blocked: boolean) => void;
  onReportUser: (targetUserId: string, reason: string) => void;
};

export function ChatPanel({ self, connectedUsers, onSend, onSendTopic, onBlockUser, onReportUser }: Props) {
  const [mode, setMode] = useState<"direct" | "topic">("direct");
  const [input, setInput] = useState("");
  const [topicInput, setTopicInput] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [selectedPeerId, setSelectedPeerId] = useState<string>(connectedUsers[0]?.userId ?? "");

  const messagesByPeer = useCosmosStore((state) => state.messagesByPeer);
  const topicMessagesById = useCosmosStore((state) => state.topicMessagesById);
  const blockedUserIds = useCosmosStore((state) => state.blockedUserIds);
  const lastError = useCosmosStore((state) => state.lastError);

  useEffect(() => {
    if (!connectedUsers.length) {
      setSelectedPeerId("");
      return;
    }

    const stillAvailable = connectedUsers.some((user) => user.userId === selectedPeerId);
    if (!stillAvailable) {
      setSelectedPeerId(connectedUsers[0]?.userId ?? "");
    }
  }, [connectedUsers, selectedPeerId]);

  const selectedPeer = useMemo(
    () => connectedUsers.find((user) => user.userId === selectedPeerId) ?? connectedUsers[0],
    [connectedUsers, selectedPeerId]
  );

  const directMessages = selectedPeer ? messagesByPeer[selectedPeer.userId] ?? [] : [];
  const topicMessages = self ? topicMessagesById[self.currentTopicId] ?? [] : [];
  const isBlockedPeer = selectedPeer ? blockedUserIds.includes(selectedPeer.userId) : false;

  return (
    <aside className="chat-panel">
      <h2>Chat</h2>

      {lastError ? <p className="chat-error">{lastError}</p> : null}

      <div className="chat-tabs">
        <button type="button" className={mode === "direct" ? "active" : ""} onClick={() => setMode("direct")}>
          Direct
        </button>
        <button type="button" className={mode === "topic" ? "active" : ""} onClick={() => setMode("topic")}>
          Topic
        </button>
      </div>

      {mode === "direct" ? (
        <>
          {!connectedUsers.length ? (
            <p>Move near another user to enable direct chat.</p>
          ) : (
            <>
              <select
                value={selectedPeer?.userId}
                onChange={(event) => setSelectedPeerId(event.target.value)}
                className="peer-select"
              >
                {connectedUsers.map((user) => (
                  <option key={user.userId} value={user.userId}>
                    {user.name}
                  </option>
                ))}
              </select>

              <div className="moderation-row">
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedPeer) return;
                    onBlockUser(selectedPeer.userId, !isBlockedPeer);
                  }}
                >
                  {isBlockedPeer ? "Unblock" : "Block"}
                </button>
                <input
                  value={reportReason}
                  onChange={(event) => setReportReason(event.target.value)}
                  placeholder="Report reason"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedPeer || reportReason.trim().length < 4) return;
                    onReportUser(selectedPeer.userId, reportReason.trim());
                    setReportReason("");
                  }}
                >
                  Report
                </button>
              </div>

              <div className="messages">
                {directMessages.map((message) => (
                  <p key={message.id}>
                    <span>{new Date(message.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    {message.message}
                  </p>
                ))}
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!selectedPeer || !input.trim() || isBlockedPeer) return;
                  onSend(selectedPeer.userId, input.trim());
                  setInput("");
                }}
                className="chat-form"
              >
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={`Message ${selectedPeer?.name ?? "peer"}`}
                  disabled={isBlockedPeer}
                />
                <button type="submit" disabled={isBlockedPeer}>
                  Send
                </button>
              </form>
            </>
          )}
        </>
      ) : (
        <>
          <p className="topic-title">Topic Room: {self?.currentTopicName ?? "Transit"}</p>
          <div className="messages">
            {topicMessages.map((message) => (
              <p key={message.id}>
                <span>
                  {message.fromUserName} · {new Date(message.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                {message.message}
              </p>
            ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!topicInput.trim()) return;
              onSendTopic(topicInput.trim());
              setTopicInput("");
            }}
            className="chat-form"
          >
            <input
              value={topicInput}
              onChange={(event) => setTopicInput(event.target.value)}
              placeholder={`Message everyone in ${self?.currentTopicName ?? "this topic"}`}
            />
            <button type="submit">Send</button>
          </form>
        </>
      )}
    </aside>
  );
}
