import { useMemo, useRef, useState } from "react";
import { AdminPanel } from "./components/AdminPanel";
import { ChatPanel } from "./components/ChatPanel";
import { Hud } from "./components/Hud";
import { MediaRoom } from "./components/MediaRoom";
import { CosmosCanvas } from "./game/CosmosCanvas";
import { getZoneForPosition } from "./game/worldTheme";
import { useCosmosMedia } from "./hooks/useCosmosMedia";
import { useCosmosSocket } from "./hooks/useCosmosSocket";
import { useCosmosStore } from "./store/useCosmosStore";
import type { Position } from "./types";

const avatarPalette = ["#ff7a18", "#00c2ff", "#ff5d8f", "#8cff66", "#ffd166", "#8e7dff"];

function randomAvatar(): string {
  return avatarPalette[Math.floor(Math.random() * avatarPalette.length)] ?? "#ff7a18";
}

export default function App() {
  const [isJoined, setIsJoined] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [joinError, setJoinError] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);

  const { self, users, world, connectedUsers, connectedUserIds, topicSummaries, lastError, setProfile } = useCosmosStore();
  const lastMoveEmitRef = useRef(0);

  const {
    socket,
    sendMove,
    sendMessage,
    sendTopicMessage,
    updateMediaPresence,
    blockUser,
    reportUser,
    adminAction,
    fetchAdminMetrics
  } = useCosmosSocket(isJoined);

  const { localStream, remoteStreams, micEnabled, camEnabled, mediaError, toggleMic, toggleCamera } = useCosmosMedia({
    isJoined,
    socket,
    self,
    connectedUserIds,
    onMediaPresenceChange: updateMediaPresence
  });

  const allUsers = useMemo(() => Object.values(users), [users]);
  const currentZoneName = useMemo(() => {
    if (!self) return "Transit";
    return getZoneForPosition(self.position)?.name ?? self.currentTopicName ?? "Transit";
  }, [self]);

  const isAdminView = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("admin") === "1";
  }, []);

  function handleJoin(event: React.FormEvent) {
    event.preventDefault();
    const normalizedName = draftName.trim();
    if (normalizedName.length < 2) {
      setJoinError("Please enter at least 2 characters for your display name.");
      return;
    }

    setJoinError("");
    setProfile(normalizedName, randomAvatar());
    setIsJoined(true);
  }

  function handleMove(position: Position) {
    if (!self) return;

    const now = performance.now();
    if (now - lastMoveEmitRef.current > 40) {
      sendMove(position);
      lastMoveEmitRef.current = now;
    }
  }

  async function handleCopyInvite(): Promise<void> {
    const topicId = self?.currentTopicId ?? "transit";
    const url = new URL(window.location.href);
    url.searchParams.set("topic", topicId);
    await navigator.clipboard.writeText(url.toString());
    setInviteCopied(true);
    window.setTimeout(() => setInviteCopied(false), 1500);
  }

  if (!isJoined) {
    return (
      <main className="join-screen">
        <section>
          <h1>Enter Virtual Cosmos</h1>
          <p>Realtime proximity world with multiplayer movement and spatial chat.</p>
          <form onSubmit={handleJoin}>
            <input
              value={draftName}
              onChange={(event) => {
                setDraftName(event.target.value);
                if (joinError) {
                  setJoinError("");
                }
              }}
              placeholder="Your display name"
              required
              minLength={2}
              maxLength={20}
            />
            <button type="submit" disabled={draftName.trim().length < 2}>
              Enter Lobby
            </button>
          </form>
          {joinError ? <p className="join-error">{joinError}</p> : null}
        </section>
      </main>
    );
  }

  if (!self) {
    return (
      <main className="join-screen">
        <section>
          <h1>Connecting to Cosmos...</h1>
          <p>Joining the realtime server and preparing your room.</p>
          {lastError ? <p className="join-error">{lastError}</p> : null}
          <button
            type="button"
            onClick={() => {
              setIsJoined(false);
            }}
          >
            Back to Name Entry
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="app-layout">
      <Hud
        self={self}
        connectedUsers={connectedUsers}
        users={allUsers}
        currentZoneName={currentZoneName}
        topicSummaries={topicSummaries}
        onCopyInvite={handleCopyInvite}
        inviteCopied={inviteCopied}
      />

      <CosmosCanvas self={self} users={users} connectedUserIds={connectedUserIds} world={world} onMove={handleMove} />

      <section className="right-stack">
        <MediaRoom
          localStream={localStream}
          remoteStreams={remoteStreams}
          users={allUsers}
          micEnabled={micEnabled}
          camEnabled={camEnabled}
          mediaError={mediaError}
          onToggleMic={toggleMic}
          onToggleCamera={toggleCamera}
        />

        <ChatPanel
          self={self}
          connectedUsers={connectedUsers}
          onSend={sendMessage}
          onSendTopic={sendTopicMessage}
          onBlockUser={blockUser}
          onReportUser={reportUser}
        />

        <AdminPanel enabled={isAdminView} onLoadMetrics={fetchAdminMetrics} onAdminAction={adminAction} />
      </section>
    </main>
  );
}
