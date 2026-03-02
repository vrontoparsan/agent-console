"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2 } from "lucide-react";

type VoiceRecorderProps = {
  onComplete: () => void;
  onCancel: () => void;
};

export function VoiceRecorder({ onComplete, onCancel }: VoiceRecorderProps) {
  const [state, setState] = useState<"idle" | "recording" | "processing">("idle");
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopRecording = useCallback(async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  async function startRecording() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      chunksRef.current = [];
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        cleanup();
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });

        if (blob.size < 1000) {
          setError("Recording too short");
          setState("idle");
          return;
        }

        setState("processing");

        try {
          const formData = new FormData();
          formData.append("audio", blob, "recording.webm");

          const res = await fetch("/api/events/voice", {
            method: "POST",
            body: formData,
          });

          if (!res.ok) {
            const data = await res.json().catch(() => null);
            throw new Error(data?.error || "Failed to process recording");
          }

          onComplete();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Processing failed");
          setState("idle");
        }
      };

      mediaRecorder.start(1000); // collect data every second
      setState("recording");
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } catch (err) {
      setError(
        err instanceof Error && err.name === "NotAllowedError"
          ? "Microphone access denied"
          : "Could not access microphone"
      );
    }
  }

  function formatDuration(secs: number) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-sm shadow-2xl p-6">
        <h2 className="text-lg font-semibold text-center mb-6">Record Event</h2>

        <div className="flex flex-col items-center gap-4">
          {state === "idle" && (
            <>
              <button
                onClick={startRecording}
                className="h-20 w-20 rounded-full bg-red-500/15 hover:bg-red-500/25 flex items-center justify-center transition-colors cursor-pointer"
              >
                <Mic className="h-8 w-8 text-red-400" />
              </button>
              <p className="text-sm text-muted-foreground">
                Tap to start recording
              </p>
            </>
          )}

          {state === "recording" && (
            <>
              <div className="relative">
                <div className="h-20 w-20 rounded-full bg-red-500/20 flex items-center justify-center animate-pulse">
                  <div className="h-16 w-16 rounded-full bg-red-500/30 flex items-center justify-center">
                    <div className="h-4 w-4 rounded-full bg-red-500" />
                  </div>
                </div>
              </div>
              <p className="text-lg font-mono tabular-nums">
                {formatDuration(duration)}
              </p>
              <Button
                variant="outline"
                size="lg"
                onClick={stopRecording}
                className="gap-2"
              >
                <Square className="h-4 w-4" />
                Stop Recording
              </Button>
            </>
          )}

          {state === "processing" && (
            <>
              <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              </div>
              <p className="text-sm text-muted-foreground">
                Transcribing and creating event...
              </p>
            </>
          )}

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          {state !== "processing" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                cleanup();
                onCancel();
              }}
              className="mt-2"
            >
              Cancel
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
