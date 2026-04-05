import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import type { CosmosUser, MediaState } from "../types";

type RemoteStream = {
  userId: string;
  stream: MediaStream;
};

type OfferPayload = {
  fromUserId: string;
  sdp: RTCSessionDescriptionInit;
};

type AnswerPayload = {
  fromUserId: string;
  sdp: RTCSessionDescriptionInit;
};

type IcePayload = {
  fromUserId: string;
  candidate: RTCIceCandidateInit;
};

type Props = {
  isJoined: boolean;
  socket: Socket | null;
  self: CosmosUser | null;
  connectedUserIds: string[];
  onMediaPresenceChange: (media: MediaState) => void;
};

const rtcConfig: RTCConfiguration = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }]
};

export function useCosmosMedia({ isJoined, socket, self, connectedUserIds, onMediaPresenceChange }: Props) {
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);
  const [micEnabled, setMicEnabled] = useState(false);
  const [camEnabled, setCamEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [mediaError, setMediaError] = useState<string>("");

  const attachLocalTracksToPeers = useCallback((stream: MediaStream) => {
    for (const peer of peersRef.current.values()) {
      const senderTrackIds = new Set(peer.getSenders().map((sender) => sender.track?.id).filter(Boolean));
      for (const track of stream.getTracks()) {
        if (senderTrackIds.has(track.id)) continue;
        peer.addTrack(track, stream);
      }
    }
  }, []);

  const removeRemoteStream = useCallback((userId: string) => {
    setRemoteStreams((prev) => prev.filter((entry) => entry.userId !== userId));
  }, []);

  const emitPresence = useCallback(
    (partial?: Partial<MediaState>) => {
      const payload: MediaState = {
        micOn: partial?.micOn ?? micEnabled,
        camOn: partial?.camOn ?? camEnabled,
        speaking: partial?.speaking ?? isSpeaking
      };
      onMediaPresenceChange(payload);
    },
    [camEnabled, isSpeaking, micEnabled, onMediaPresenceChange]
  );

  const closePeer = useCallback(
    (peerId: string) => {
      const peer = peersRef.current.get(peerId);
      if (!peer) return;
      peer.close();
      peersRef.current.delete(peerId);
      removeRemoteStream(peerId);
    },
    [removeRemoteStream]
  );

  const ensureLocalStream = useCallback(async (): Promise<MediaStream | null> => {
    if (localStreamRef.current) return localStreamRef.current;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 30 } }
      });

      localStreamRef.current = stream;
      setLocalStream(stream);
      for (const track of stream.getAudioTracks()) {
        track.enabled = micEnabled;
      }
      for (const track of stream.getVideoTracks()) {
        track.enabled = camEnabled;
      }
      attachLocalTracksToPeers(stream);
      setMediaError("");
      return stream;
    } catch (error) {
      console.error("[media] permission/access error", error);
      setMediaError("Camera/mic permission blocked. Allow media access and refresh.");
      return null;
    }
  }, [attachLocalTracksToPeers, camEnabled, micEnabled]);

  const createPeer = useCallback(
    (peerId: string): RTCPeerConnection | null => {
      if (!socket) return null;

      const existing = peersRef.current.get(peerId);
      if (existing) return existing;

      const peer = new RTCPeerConnection(rtcConfig);
      peersRef.current.set(peerId, peer);

      const stream = localStreamRef.current;
      if (stream) {
        for (const track of stream.getTracks()) {
          peer.addTrack(track, stream);
        }
      }

      peer.onicecandidate = (event) => {
        if (!event.candidate) return;
        socket.emit("webrtc:ice-candidate", {
          toUserId: peerId,
          candidate: event.candidate.toJSON()
        });
      };

      peer.ontrack = (event) => {
        const streamFromPeer = event.streams[0];
        if (!streamFromPeer) return;

        setRemoteStreams((prev) => {
          const withoutPeer = prev.filter((entry) => entry.userId !== peerId);
          return [...withoutPeer, { userId: peerId, stream: streamFromPeer }];
        });
      };

      peer.onconnectionstatechange = () => {
        if (["failed", "disconnected", "closed"].includes(peer.connectionState)) {
          closePeer(peerId);
        }
      };

      return peer;
    },
    [closePeer, socket]
  );

  const sendOffer = useCallback(
    async (peerId: string) => {
      if (!socket) return;
      const peer = createPeer(peerId);
      if (!peer) return;

      try {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);

        if (!peer.localDescription) return;

        socket.emit("webrtc:offer", {
          toUserId: peerId,
          sdp: peer.localDescription
        });
      } catch (error) {
        console.error("[webrtc] offer failed", error);
      }
    },
    [createPeer, socket]
  );

  const toggleMic = useCallback(() => {
    void (async () => {
      let stream = localStreamRef.current;
      const next = !micEnabled;

      if (next && !stream) {
        stream = await ensureLocalStream();
        if (!stream) return;
      }

      if (stream) {
        for (const track of stream.getAudioTracks()) {
          track.enabled = next;
        }
      }

      setMicEnabled(next);
      emitPresence({ micOn: next, speaking: next ? isSpeaking : false });

      if (!next) {
        setIsSpeaking(false);
      }
    })();
  }, [emitPresence, ensureLocalStream, isSpeaking, micEnabled]);

  const toggleCamera = useCallback(() => {
    void (async () => {
      let stream = localStreamRef.current;
      const next = !camEnabled;

      if (next && !stream) {
        stream = await ensureLocalStream();
        if (!stream) return;
      }

      if (stream) {
        for (const track of stream.getVideoTracks()) {
          track.enabled = next;
        }
      }

      setCamEnabled(next);
      emitPresence({ camOn: next });
    })();
  }, [camEnabled, emitPresence, ensureLocalStream]);

  useEffect(() => {
    if (!isJoined || !socket || !self) return;

    emitPresence();

    const handleOffer = async ({ fromUserId, sdp }: OfferPayload) => {
      const stream = await ensureLocalStream();
      if (!stream) return;

      const peer = createPeer(fromUserId);
      if (!peer) return;

      try {
        if (peer.signalingState !== "stable") {
          await peer.setLocalDescription({ type: "rollback" });
        }

        await peer.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);

        if (!peer.localDescription) return;

        socket.emit("webrtc:answer", {
          toUserId: fromUserId,
          sdp: peer.localDescription
        });
      } catch (error) {
        console.error("[webrtc] answer failed", error);
      }
    };

    const handleAnswer = async ({ fromUserId, sdp }: AnswerPayload) => {
      const peer = peersRef.current.get(fromUserId);
      if (!peer) return;

      try {
        await peer.setRemoteDescription(new RTCSessionDescription(sdp));
      } catch (error) {
        console.error("[webrtc] apply answer failed", error);
      }
    };

    const handleIceCandidate = async ({ fromUserId, candidate }: IcePayload) => {
      const peer = peersRef.current.get(fromUserId);
      if (!peer) return;

      try {
        await peer.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error("[webrtc] ICE candidate failed", error);
      }
    };

    const handleUserLeft = ({ userId }: { userId: string }) => {
      closePeer(userId);
    };

    socket.on("webrtc:offer", handleOffer);
    socket.on("webrtc:answer", handleAnswer);
    socket.on("webrtc:ice-candidate", handleIceCandidate);
    socket.on("world:user_left", handleUserLeft);

    return () => {
      socket.off("webrtc:offer", handleOffer);
      socket.off("webrtc:answer", handleAnswer);
      socket.off("webrtc:ice-candidate", handleIceCandidate);
      socket.off("world:user_left", handleUserLeft);
    };
  }, [closePeer, createPeer, emitPresence, ensureLocalStream, isJoined, self, socket]);

  useEffect(() => {
    if (!self || !socket) return;

    const currentSet = new Set(connectedUserIds);

    for (const peerId of peersRef.current.keys()) {
      if (!currentSet.has(peerId)) {
        closePeer(peerId);
      }
    }

    for (const peerId of connectedUserIds) {
      if (peerId === self.userId) continue;
      if (peersRef.current.has(peerId)) continue;

      if (self.userId < peerId) {
        sendOffer(peerId);
      }
    }
  }, [closePeer, connectedUserIds, self, sendOffer, socket]);

  useEffect(() => {
    const stream = localStreamRef.current;
    if (!stream || !micEnabled) return;

    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    const AudioContextCtor = window.AudioContext;
    if (!AudioContextCtor) return;

    let context: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let interval: number | null = null;

    try {
      context = new AudioContextCtor();
      source = context.createMediaStreamSource(new MediaStream([audioTrack]));
      analyser = context.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const data = new Uint8Array(analyser.fftSize);
      interval = window.setInterval(() => {
        if (!analyser) return;

        analyser.getByteTimeDomainData(data);
        let total = 0;
        for (let index = 0; index < data.length; index += 1) {
          const normalized = (data[index] ?? 128) - 128;
          total += normalized * normalized;
        }

        const rms = Math.sqrt(total / data.length);
        const speakingNow = rms > 11;

        setIsSpeaking((previous) => {
          if (previous !== speakingNow) {
            emitPresence({ speaking: speakingNow });
          }
          return speakingNow;
        });
      }, 250);
    } catch (error) {
      console.error("[media] speaking analyzer setup failed", error);
      return;
    }

    return () => {
      if (interval !== null) {
        window.clearInterval(interval);
      }

      source?.disconnect();
      analyser?.disconnect();
      context?.close().catch(() => undefined);
    };
  }, [emitPresence, micEnabled, localStream]);

  useEffect(() => {
    return () => {
      for (const peer of peersRef.current.values()) {
        peer.close();
      }
      peersRef.current.clear();

      const stream = localStreamRef.current;
      if (stream) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
      }

      localStreamRef.current = null;
      setLocalStream(null);
      setRemoteStreams([]);
    };
  }, []);

  return useMemo(
    () => ({
      localStream,
      remoteStreams,
      micEnabled,
      camEnabled,
      isSpeaking,
      mediaError,
      toggleMic,
      toggleCamera
    }),
    [camEnabled, isSpeaking, localStream, mediaError, micEnabled, remoteStreams, toggleCamera, toggleMic]
  );
}
