import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { BASE_URL } from "../lib/api";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

/**
 * Manages a full-mesh WebRTC call: one RTCPeerConnection per remote participant,
 * with Socket.IO used purely for signaling (offer/answer/ICE relay).
 */
export function useMeshCall({ roomId, username, token, initialStream, onEvent }) {
  const [localStream, setLocalStream] = useState(null);
  const [participants, setParticipants] = useState(new Map()); // socketId -> { username, stream, muted, videoOff }
  const [messages, setMessages] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [connected, setConnected] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);

  const socketRef = useRef(null);
  const peersRef = useRef(new Map()); // socketId -> RTCPeerConnection
  const localStreamRef = useRef(null);
  const cameraTrackRef = useRef(null);

  const upsertParticipant = useCallback((socketId, patch) => {
    setParticipants((prev) => {
      const next = new Map(prev);
      next.set(socketId, { ...(next.get(socketId) || { username: "Guest", muted: false, videoOff: false }), ...patch });
      return next;
    });
  }, []);

  const removeParticipant = useCallback((socketId) => {
    setParticipants((prev) => {
      const next = new Map(prev);
      next.delete(socketId);
      return next;
    });
    const pc = peersRef.current.get(socketId);
    if (pc) {
      pc.close();
      peersRef.current.delete(socketId);
    }
  }, []);

  const createPeerConnection = useCallback(
    (targetId) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current));
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current.emit("ice_candidate", { targetId, candidate: event.candidate });
        }
      };

      pc.ontrack = (event) => {
        upsertParticipant(targetId, { stream: event.streams[0] });
      };

      pc.onconnectionstatechange = () => {
        if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
          // leave cleanup to explicit disconnect handling
        }
      };

      peersRef.current.set(targetId, pc);
      return pc;
    },
    [upsertParticipant]
  );

  const callPeer = useCallback(
    async (targetId, remoteUsername) => {
      const pc = createPeerConnection(targetId);
      upsertParticipant(targetId, { username: remoteUsername });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current.emit("offer", { targetId, offer });
    },
    [createPeerConnection, upsertParticipant]
  );

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // initialStream === null means the caller (e.g. the lobby) already tried and
      // failed to get camera/mic access — join receive-only rather than retrying.
      // initialStream === undefined means no attempt was made yet; acquire it here.
      let stream = initialStream ?? null;
      if (stream === null && initialStream === undefined) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        } catch (err) {
          onEvent?.({ type: "media-error", message: err.message });
          stream = null;
        }
      }
      if (cancelled) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }
      if (stream) {
        localStreamRef.current = stream;
        cameraTrackRef.current = stream.getVideoTracks()[0] || null;
        setLocalStream(stream);
      }

      const socket = io(BASE_URL || undefined, { transports: ["websocket"] });
      socketRef.current = socket;

      socket.on("connect", () => {
        setConnected(true);
        socket.emit("join_room", { roomId, username, token });
      });

      socket.on("connect_error", (err) => {
        onEvent?.({ type: "connect-error", message: err.message });
      });

      socket.on("existing_participants", ({ participants: existing }) => {
        existing.forEach(({ socketId, username: remoteUsername }) => {
          callPeer(socketId, remoteUsername);
        });
      });

      socket.on("user_connected", ({ socketId, username: remoteUsername }) => {
        upsertParticipant(socketId, { username: remoteUsername });
      });

      socket.on("offer", async ({ fromId, offer }) => {
        const pc = createPeerConnection(fromId);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("answer", { targetId: fromId, answer });
      });

      socket.on("answer", async ({ fromId, answer }) => {
        const pc = peersRef.current.get(fromId);
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
      });

      socket.on("ice_candidate", async ({ fromId, candidate }) => {
        const pc = peersRef.current.get(fromId);
        if (pc && candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch {
            /* ignore late candidates on closed connections */
          }
        }
      });

      socket.on("user_disconnected", ({ socketId }) => removeParticipant(socketId));

      socket.on("participant_audio_toggled", ({ socketId, muted }) => upsertParticipant(socketId, { muted }));
      socket.on("participant_video_toggled", ({ socketId, videoOff }) => upsertParticipant(socketId, { videoOff }));

      socket.on("chat_message", (message) => setMessages((prev) => [...prev, message]));
      socket.on("reaction", (reaction) => {
        const id = `${reaction.socketId}-${Date.now()}-${Math.random()}`;
        setReactions((prev) => [...prev, { ...reaction, id }]);
        setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== id)), 3000);
      });

      socket.on("disconnect", () => setConnected(false));
    }

    init();

    return () => {
      cancelled = true;
      socketRef.current?.emit("leave_room");
      socketRef.current?.disconnect();
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const toggleAudio = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return false;
    const track = stream.getAudioTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    socketRef.current?.emit("toggle_audio", { muted: !track.enabled });
    return !track.enabled;
  }, []);

  const toggleVideo = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return false;
    const track = stream.getVideoTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    socketRef.current?.emit("toggle_video", { videoOff: !track.enabled });
    return !track.enabled;
  }, []);

  const shareScreen = useCallback(async () => {
    let displayStream;
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    } catch {
      return; // user cancelled the picker
    }
    const screenTrack = displayStream.getVideoTracks()[0];

    peersRef.current.forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
      if (sender) sender.replaceTrack(screenTrack);
    });

    setScreenSharing(true);
    socketRef.current?.emit("screen_share_started");

    screenTrack.onended = () => stopScreenShare();
  }, []);

  const stopScreenShare = useCallback(() => {
    const camTrack = cameraTrackRef.current;
    if (camTrack) {
      peersRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
        if (sender) sender.replaceTrack(camTrack);
      });
    }
    setScreenSharing(false);
    socketRef.current?.emit("screen_share_stopped");
  }, []);

  const sendMessage = useCallback((text) => {
    socketRef.current?.emit("chat_message", { text });
  }, []);

  const sendReaction = useCallback((emoji) => {
    socketRef.current?.emit("reaction", { emoji });
  }, []);

  return {
    localStream,
    participants,
    messages,
    reactions,
    connected,
    screenSharing,
    toggleAudio,
    toggleVideo,
    shareScreen,
    stopScreenShare,
    sendMessage,
    sendReaction,
  };
}
