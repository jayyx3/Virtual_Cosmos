import { useEffect, useRef } from "react";
import type { CosmosUser } from "../types";

type RemoteStream = {
  userId: string;
  stream: MediaStream;
};

type Props = {
  localStream: MediaStream | null;
  remoteStreams: RemoteStream[];
  users: CosmosUser[];
  micEnabled: boolean;
  camEnabled: boolean;
  mediaError: string;
  onToggleMic: () => void;
  onToggleCamera: () => void;
};

function LocalPreview({ stream }: { stream: MediaStream | null }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = stream;
  }, [stream]);

  return <video ref={videoRef} autoPlay muted playsInline className="media-video" />;
}

function RemotePreview({ stream }: { stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = stream;
  }, [stream]);

  return <video ref={videoRef} autoPlay playsInline className="media-video" />;
}

export function MediaRoom({
  localStream,
  remoteStreams,
  users,
  micEnabled,
  camEnabled,
  mediaError,
  onToggleMic,
  onToggleCamera
}: Props) {
  return (
    <section className="media-room">
      <header className="media-room-header">
        <h2>Live Room</h2>
        <p>Voice and video with users currently in your proximity radius.</p>
      </header>

      <div className="media-controls">
        <button type="button" className={micEnabled ? "" : "off"} onClick={onToggleMic}>
          {micEnabled ? "Mute Mic" : "Unmute Mic"}
        </button>
        <button type="button" className={camEnabled ? "" : "off"} onClick={onToggleCamera}>
          {camEnabled ? "Stop Camera" : "Start Camera"}
        </button>
      </div>

      {mediaError ? <p className="media-error">{mediaError}</p> : null}

      <div className="media-grid">
        <article className="media-tile self">
          <div className="media-label">You</div>
          <LocalPreview stream={localStream} />
        </article>

        {remoteStreams.map((entry) => {
          const userName = users.find((user) => user.userId === entry.userId)?.name ?? "Nearby user";
          return (
            <article className="media-tile" key={entry.userId}>
              <div className="media-label">{userName}</div>
              <RemotePreview stream={entry.stream} />
            </article>
          );
        })}
      </div>

      {!remoteStreams.length ? <p className="media-hint">No active nearby video yet. Move closer to other users.</p> : null}
    </section>
  );
}
