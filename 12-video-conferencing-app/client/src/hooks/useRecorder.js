import { useCallback, useEffect, useRef, useState } from "react";
import { BASE_URL } from "../lib/api";

const CANDIDATE_MIME_TYPES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
];

function pickSupportedMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  return CANDIDATE_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function useRecorder({ roomId, token, onEvent }) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => () => clearInterval(timerRef.current), []);

  const start = useCallback(
    (stream) => {
      if (!stream) {
        onEvent?.({ type: "error", message: "No active camera/mic stream to record." });
        return;
      }
      if (typeof MediaRecorder === "undefined") {
        onEvent?.({ type: "error", message: "Recording isn't supported in this browser." });
        return;
      }

      const mimeType = pickSupportedMimeType();
      chunksRef.current = [];

      let recorder;
      try {
        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      } catch (err) {
        onEvent?.({ type: "error", message: `Couldn't start recording: ${err.message}` });
        return;
      }

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onerror = (e) => {
        onEvent?.({ type: "error", message: `Recording error: ${e.error?.message || "unknown error"}` });
      };

      recorder.start(1000);
      recorderRef.current = recorder;
      setRecording(true);
      setElapsedSec(0);
      timerRef.current = setInterval(() => setElapsedSec((s) => s + 1), 1000);
      onEvent?.({ type: "started" });
    },
    [onEvent]
  );

  const stop = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    clearInterval(timerRef.current);

    const blob = await new Promise((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" }));
      recorder.stop();
    });
    setRecording(false);
    recorderRef.current = null;

    if (blob.size === 0) {
      onEvent?.({ type: "error", message: "Recording produced no data." });
      return;
    }

    const filename = `${roomId}-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
    downloadBlob(blob, filename);
    onEvent?.({ type: "saved", filename });

    if (!token) return; // cloud copy requires an authenticated user; local file is already saved

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("roomId", roomId);
      formData.append("recording", blob, filename);
      const res = await fetch(`${BASE_URL}/api/recordings`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Upload failed");
      onEvent?.({ type: "uploaded", filename });
    } catch (err) {
      onEvent?.({ type: "error", message: `Local file saved, but cloud upload failed: ${err.message}` });
    } finally {
      setUploading(false);
    }
  }, [roomId, token, onEvent]);

  return { recording, uploading, elapsedSec, start, stop };
}
