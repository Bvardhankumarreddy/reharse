"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "@clerk/nextjs";
import { clsx } from "clsx";

// ── Types ──────────────────────────────────────────────────────────────────────

type Role   = "interviewer" | "candidate";
type Status = "lobby" | "waiting" | "active" | "ended";

interface Message {
  id:   string;
  from: Role | "system";
  text: string;
  time: string;
}

const INTERVIEW_TYPES = [
  { value: "behavioral",    label: "Behavioral",    icon: "forum" },
  { value: "coding",        label: "Coding",        icon: "code" },
  { value: "system-design", label: "System Design", icon: "architecture" },
];

const STARTER_QUESTIONS: Record<string, string[]> = {
  behavioral: [
    "Tell me about a time you had to lead a team through a difficult situation.",
    "Describe a project where you had to learn a new technology quickly.",
    "How do you handle disagreements with your manager?",
    "Give an example of a time you failed. What did you learn?",
  ],
  coding: [
    "Implement a function to find the longest substring without repeating characters.",
    "Given a binary tree, return the level-order traversal of its nodes.",
    "Design a LRU cache with O(1) get and put operations.",
    "Write a function to check if a string is a valid palindrome.",
  ],
  "system-design": [
    "Design a URL shortening service like bit.ly.",
    "Design a real-time chat application for millions of users.",
    "How would you design Twitter's feed ranking system?",
    "Design a distributed key-value store.",
  ],
};

// ── Timer ──────────────────────────────────────────────────────────────────────

function useTimer(active: boolean) {
  const [seconds, setSeconds] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (active) {
      ref.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else {
      if (ref.current) clearInterval(ref.current);
    }
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [active]);

  const reset = useCallback(() => setSeconds(0), []);
  const fmt   = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return { seconds, fmt, reset };
}

// ── Real WebSocket hook ────────────────────────────────────────────────────────

function usePairSocket(opts: {
  onPartnerJoined: () => void;
  onPartnerLeft:   () => void;
  onMessage:       (text: string) => void;
  onError?:        (msg: string) => void;
  onOffer?:        (sdp: RTCSessionDescriptionInit) => void;
  onAnswer?:       (sdp: RTCSessionDescriptionInit) => void;
  onIce?:          (candidate: RTCIceCandidateInit) => void;
}) {
  const socketRef  = useRef<Socket | null>(null);
  const optsRef    = useRef(opts);
  useEffect(() => { optsRef.current = opts; }, [opts]);

  const connect = useCallback(async (getToken: () => Promise<string | null>) => {
    const token  = await getToken();
    const wsBase = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3003/api/v1")
      .replace(/\/api\/v1\/?$/, "");

    const socket = io(`${wsBase}/pair`, {
      auth:       { token },
      transports: ["websocket"],
    });
    socketRef.current = socket;

    socket.on("pair:partner_joined", () => optsRef.current.onPartnerJoined());
    socket.on("pair:partner_left",   () => optsRef.current.onPartnerLeft());
    socket.on("pair:message",        (data: { text: string }) => optsRef.current.onMessage(data.text));
    socket.on("pair:error",          (data: { message: string }) => optsRef.current.onError?.(data.message));
    socket.on("pair:webrtc_offer",   (data: { sdp: RTCSessionDescriptionInit }) => optsRef.current.onOffer?.(data.sdp));
    socket.on("pair:webrtc_answer",  (data: { sdp: RTCSessionDescriptionInit }) => optsRef.current.onAnswer?.(data.sdp));
    socket.on("pair:webrtc_ice",     (data: { candidate: RTCIceCandidateInit }) => optsRef.current.onIce?.(data.candidate));

    return socket;
  }, []);

  const disconnect = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
  }, []);

  const createRoom = useCallback((interviewType: string): Promise<{ code?: string; error?: string }> => {
    return new Promise((resolve) => {
      socketRef.current?.emit("pair:create_room", { interviewType }, resolve);
    });
  }, []);

  const joinRoom = useCallback((code: string): Promise<{ ok?: boolean; error?: string; interviewType?: string }> => {
    return new Promise((resolve) => {
      socketRef.current?.emit("pair:join_room", { code }, resolve);
    });
  }, []);

  const sendMessage  = useCallback((text: string) => { socketRef.current?.emit("pair:message", { text }); }, []);
  const sendOffer    = useCallback((sdp: RTCSessionDescriptionInit) => { socketRef.current?.emit("pair:webrtc_offer",  { sdp }); }, []);
  const sendAnswer   = useCallback((sdp: RTCSessionDescriptionInit) => { socketRef.current?.emit("pair:webrtc_answer", { sdp }); }, []);
  const sendIce      = useCallback((candidate: RTCIceCandidateInit) => { socketRef.current?.emit("pair:webrtc_ice",    { candidate }); }, []);
  const leaveRoom    = useCallback(() => { socketRef.current?.emit("pair:leave_room"); }, []);

  // Cleanup on unmount
  useEffect(() => () => { socketRef.current?.disconnect(); }, []);

  return { connect, disconnect, createRoom, joinRoom, sendMessage, leaveRoom, sendOffer, sendAnswer, sendIce };
}

// ── WebRTC hook ────────────────────────────────────────────────────────────────

const STUN = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] };

function useWebRTC(send: { offer: (s: RTCSessionDescriptionInit) => void; answer: (s: RTCSessionDescriptionInit) => void; ice: (c: RTCIceCandidateInit) => void }) {
  const pcRef          = useRef<RTCPeerConnection | null>(null);
  const sendRef        = useRef(send);
  useEffect(() => { sendRef.current = send; }, [send]);

  const [localStream,  setLocalStream]  = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [callActive,   setCallActive]   = useState(false);
  const [videoOn,      setVideoOn]      = useState(true);
  const [muted,        setMuted]        = useState(false);
  const [mediaError,   setMediaError]   = useState<string | null>(null);

  function buildPc(remote: MediaStream): RTCPeerConnection {
    const pc = new RTCPeerConnection(STUN);
    pc.ontrack            = (e) => e.streams[0]?.getTracks().forEach((t) => remote.addTrack(t));
    pc.onicecandidate     = (e) => { if (e.candidate) sendRef.current.ice(e.candidate.toJSON()); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") hangUp();
    };
    pcRef.current = pc;
    return pc;
  }

  async function startCall() {
    setMediaError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      setLocalStream(stream);
      const remote = new MediaStream();
      setRemoteStream(remote);
      const pc = buildPc(remote);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendRef.current.offer(offer);
      setCallActive(true);
    } catch (err) {
      setMediaError(err instanceof Error ? err.message : "Cannot access camera/microphone");
    }
  }

  async function handleOffer(sdp: RTCSessionDescriptionInit) {
    setMediaError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      setLocalStream(stream);
      const remote = new MediaStream();
      setRemoteStream(remote);
      const pc = buildPc(remote);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      await pc.setRemoteDescription(sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendRef.current.answer(answer);
      setCallActive(true);
    } catch (err) {
      setMediaError(err instanceof Error ? err.message : "Cannot access camera/microphone");
    }
  }

  async function handleAnswer(sdp: RTCSessionDescriptionInit) {
    await pcRef.current?.setRemoteDescription(sdp).catch(() => {});
  }

  async function handleIce(candidate: RTCIceCandidateInit) {
    await pcRef.current?.addIceCandidate(candidate).catch(() => {});
  }

  function hangUp() {
    localStream?.getTracks().forEach((t) => t.stop());
    pcRef.current?.close();
    pcRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setCallActive(false);
    setVideoOn(true);
    setMuted(false);
  }

  function toggleVideo() {
    if (!localStream) return;
    const next = !videoOn;
    localStream.getVideoTracks().forEach((t) => { t.enabled = next; });
    setVideoOn(next);
  }

  function toggleMute() {
    if (!localStream) return;
    const next = !muted;
    localStream.getAudioTracks().forEach((t) => { t.enabled = !next; });
    setMuted(next);
  }

  // Clean up on unmount
  useEffect(() => () => { localStream?.getTracks().forEach((t) => t.stop()); pcRef.current?.close(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { localStream, remoteStream, callActive, videoOn, muted, mediaError, startCall, handleOffer, handleAnswer, handleIce, hangUp, toggleVideo, toggleMute };
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PairPracticePage() {
  const { getToken } = useAuth();

  const [status,        setStatus]        = useState<Status>("lobby");
  const [myRole,        setMyRole]        = useState<Role>("candidate");
  const [roomCode,      setRoomCode]      = useState("");
  const [joinCode,      setJoinCode]      = useState("");
  const [joinError,     setJoinError]     = useState<string | null>(null);
  const [interviewType, setInterviewType] = useState("behavioral");
  const [messages,      setMessages]      = useState<Message[]>([]);
  const [input,         setInput]         = useState("");
  const [notes,         setNotes]         = useState("");
  const [notesOpen,     setNotesOpen]     = useState(false);
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [suggestedRole, setSuggestedRole] = useState<Role | null>(null);

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const { fmt: timer, reset: resetTimer } = useTimer(status === "active");

  const now = () => new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  const addMessage = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  // WebRTC — forward signals through the socket; refs break the circular dep
  const sendOfferRef  = useRef<(s: RTCSessionDescriptionInit) => void>(() => {});
  const sendAnswerRef = useRef<(s: RTCSessionDescriptionInit) => void>(() => {});
  const sendIceRef    = useRef<(c: RTCIceCandidateInit) => void>(() => {});

  const rtc = useWebRTC({
    offer:  (s) => sendOfferRef.current(s),
    answer: (s) => sendAnswerRef.current(s),
    ice:    (c) => sendIceRef.current(c),
  });

  const { connect, createRoom, joinRoom, sendMessage, leaveRoom, disconnect,
          sendOffer, sendAnswer, sendIce } = usePairSocket({
    onPartnerJoined: () => {
      setPartnerOnline(true);
      setStatus("active");
      resetTimer();
      addMessage({ id: crypto.randomUUID(), from: "system", text: "Your practice partner has joined.", time: now() });
    },
    onPartnerLeft: () => {
      setPartnerOnline(false);
      rtc.hangUp();
      addMessage({ id: crypto.randomUUID(), from: "system", text: "Your partner has left the session.", time: now() });
    },
    onMessage: (text) => {
      const peerRole: Role = myRole === "interviewer" ? "candidate" : "interviewer";
      addMessage({ id: crypto.randomUUID(), from: peerRole, text, time: now() });
    },
    onError:  (msg) => setJoinError(msg),
    onOffer:  (sdp) => rtc.handleOffer(sdp),
    onAnswer: (sdp) => rtc.handleAnswer(sdp),
    onIce:    (c)   => rtc.handleIce(c),
  });

  // Wire socket send methods into rtc refs after mount
  useEffect(() => {
    sendOfferRef.current  = sendOffer;
    sendAnswerRef.current = sendAnswer;
    sendIceRef.current    = sendIce;
  }, [sendOffer, sendAnswer, sendIce]);

  // Video element refs — assigned via callback ref so React handles the stream binding
  const localVideoRef  = useCallback((el: HTMLVideoElement | null) => {
    if (el && rtc.localStream)  { el.srcObject = rtc.localStream;  }
  }, [rtc.localStream]);
  const remoteVideoRef = useCallback((el: HTMLVideoElement | null) => {
    if (el && rtc.remoteStream) { el.srcObject = rtc.remoteStream; }
  }, [rtc.remoteStream]);

  // Auto-scroll chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleCreate() {
    setJoinError(null);
    await connect(getToken);
    const res = await createRoom(interviewType);
    if (res.error || !res.code) {
      setJoinError(res.error ?? "Failed to create room.");
      disconnect();
      return;
    }
    setRoomCode(res.code);
    setMyRole("interviewer");
    setStatus("waiting");
  }

  async function handleJoin() {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) { setJoinError("Enter the 6-character room code."); return; }
    setJoinError(null);
    await connect(getToken);
    const res = await joinRoom(code);
    if (res.error) { setJoinError(res.error); disconnect(); return; }
    setRoomCode(code);
    setMyRole("candidate");
    setPartnerOnline(true);
    setStatus("active");
    resetTimer();
    addMessage({ id: crypto.randomUUID(), from: "system", text: "You joined the session. The interviewer is ready.", time: now() });
  }

  function handleSend() {
    if (!input.trim()) return;
    sendMessage(input.trim());
    addMessage({ id: crypto.randomUUID(), from: myRole, text: input.trim(), time: now() });
    setInput("");
  }

  function handleEnd() {
    rtc.hangUp();
    leaveRoom();
    setStatus("ended");
  }

  function handleSwitchRoles() {
    const nextRole: Role = myRole === "interviewer" ? "candidate" : "interviewer";
    setSuggestedRole(nextRole);
    leaveRoom();
    disconnect();
    setStatus("lobby");
    setMessages([]);
    setRoomCode("");
    setJoinCode("");
  }

  function handleRestart() {
    setSuggestedRole(null);
    rtc.hangUp();
    leaveRoom();
    disconnect();
    setStatus("lobby");
    setMessages([]);
    setRoomCode("");
    setJoinCode("");
    setInput("");
    setNotes("");
    setPartnerOnline(false);
    resetTimer();
  }

  function handleSuggest() {
    if (myRole !== "interviewer") return;
    const questions = STARTER_QUESTIONS[interviewType] ?? STARTER_QUESTIONS.behavioral;
    setInput(questions[Math.floor(Math.random() * questions.length)]);
  }

  // ── Lobby ──────────────────────────────────────────────────────────────────
  if (status === "lobby") {
    return (
      <div className="max-w-2xl space-y-6">
        <div>
          <h2 className="text-heading-l text-text-pri">Peer Practice</h2>
          <p className="text-body text-text-sec mt-1">
            Practice with a friend — one plays interviewer, one plays candidate. Share a room code to connect.
          </p>
        </div>

        {/* Role-switch hint */}
        {suggestedRole && (
          <div className="flex items-center gap-3 bg-blue/5 border border-blue/20 rounded-xl px-4 py-3">
            <span className="material-symbols-outlined text-blue text-[18px]"
              style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>swap_horiz</span>
            <p className="text-[13px] text-text-sec flex-1">
              Time to try as <strong className="text-text-pri capitalize">{suggestedRole}</strong> —{" "}
              {suggestedRole === "interviewer"
                ? "create a new room and share the code with your partner."
                : "ask your partner to create a room and join with their code."}
            </p>
            <button onClick={() => setSuggestedRole(null)} className="text-text-muted hover:text-text-sec flex-shrink-0">
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        )}

        {/* Interview type picker */}
        <div className="bg-surface border border-border rounded-2xl p-5 space-y-4">
          <p className="text-[14px] font-bold text-text-pri">Interview type</p>
          <div className="flex flex-wrap gap-2">
            {INTERVIEW_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setInterviewType(t.value)}
                className={clsx(
                  "flex items-center gap-2 px-4 py-2 rounded-full border-2 text-[13px] font-semibold transition-all",
                  interviewType === t.value
                    ? "border-blue bg-blue-50/50 text-blue"
                    : "border-border text-text-sec hover:border-blue/30"
                )}
              >
                <span className="material-symbols-outlined text-[15px]">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {/* Create room */}
          <div className="bg-surface border border-border rounded-2xl p-5 space-y-4 flex flex-col">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-blue/10 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-blue text-[18px]"
                  style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>add_circle</span>
              </span>
              <p className="text-[14px] font-bold text-text-pri">Create a room</p>
            </div>
            <p className="text-[13px] text-text-sec flex-1">
              Start a session as the <strong>interviewer</strong>. Share the 6-letter code with your partner.
            </p>
            <button
              onClick={handleCreate}
              className="w-full btn-gradient text-white py-2.5 rounded-btn font-bold text-[14px] shadow-blue-glow hover:-translate-y-0.5 transition-all"
            >
              Create Room
            </button>
          </div>

          {/* Join room */}
          <div className="bg-surface border border-border rounded-2xl p-5 space-y-4 flex flex-col">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-[#7C3AED] text-[18px]"
                  style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>login</span>
              </span>
              <p className="text-[14px] font-bold text-text-pri">Join a room</p>
            </div>
            <p className="text-[13px] text-text-sec flex-1">
              Join as the <strong>candidate</strong>. Enter the code your partner shared.
            </p>
            <div className="flex gap-2">
              <input
                value={joinCode}
                onChange={(e) => { setJoinCode(e.target.value.toUpperCase().slice(0, 6)); setJoinError(null); }}
                placeholder="ABCD12"
                maxLength={6}
                className="flex-1 h-10 px-3 bg-bg-app border border-border rounded-btn text-[14px] font-mono font-bold text-text-pri uppercase
                           placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-blue/20 focus:border-blue/40 transition tracking-widest"
              />
              <button
                onClick={handleJoin}
                className="px-4 py-2 bg-[#7C3AED] text-white rounded-btn text-[13px] font-semibold hover:bg-[#6D28D9] transition-colors flex-shrink-0"
              >
                Join
              </button>
            </div>
            {joinError && <p className="text-[12px] text-red-500">{joinError}</p>}
          </div>
        </div>

        {/* How it works */}
        <div className="bg-bg-app border border-border rounded-2xl p-5 space-y-3">
          <p className="text-[13px] font-bold text-text-pri">How it works</p>
          <ol className="space-y-2">
            {[
              "One person creates a room and shares the 6-letter code.",
              "The other joins as the candidate — session starts instantly.",
              "Interviewer asks questions; candidate answers in chat.",
              "Switch roles after each round to practice both sides.",
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3 text-[13px] text-text-sec">
                <span className="w-5 h-5 rounded-full bg-blue/10 text-blue text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <p className="text-[11px] text-text-muted flex items-center gap-1">
            <span className="material-symbols-outlined text-[13px]">info</span>
            Text-based session. Both users must have the app open.
          </p>
        </div>
      </div>
    );
  }

  // ── Waiting for partner ────────────────────────────────────────────────────
  if (status === "waiting") {
    return (
      <div className="max-w-md mx-auto mt-16 text-center space-y-6">
        <div className="w-20 h-20 mx-auto rounded-full bg-blue/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-[40px] text-blue animate-pulse"
            style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 48" }}>group</span>
        </div>
        <div>
          <p className="text-[18px] font-black text-text-pri">Waiting for your partner…</p>
          <p className="text-text-sec text-[14px] mt-1">Share this code with the person you want to practice with</p>
        </div>
        <div className="inline-flex flex-col items-center gap-2">
          <div className="flex gap-1.5">
            {roomCode.split("").map((ch, i) => (
              <span key={i}
                className="w-11 h-14 flex items-center justify-center bg-surface border-2 border-blue/30 rounded-xl
                           text-[24px] font-black font-mono text-text-pri shadow-sm">
                {ch}
              </span>
            ))}
          </div>
          <button
            onClick={() => navigator.clipboard.writeText(roomCode)}
            className="flex items-center gap-1.5 text-[12px] text-blue font-semibold hover:underline"
          >
            <span className="material-symbols-outlined text-[14px]">content_copy</span>
            Copy code
          </button>
        </div>
        <div className="flex items-center gap-2 justify-center">
          <div className="w-2 h-2 rounded-full bg-blue animate-bounce" style={{ animationDelay: "0ms" }} />
          <div className="w-2 h-2 rounded-full bg-blue animate-bounce" style={{ animationDelay: "150ms" }} />
          <div className="w-2 h-2 rounded-full bg-blue animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
        <button onClick={handleRestart} className="text-[13px] text-text-muted hover:text-text-sec transition-colors">
          Cancel
        </button>
      </div>
    );
  }

  // ── Session ended ──────────────────────────────────────────────────────────
  if (status === "ended") {
    const total   = messages.filter((m) => m.from !== "system").length;
    const myCount = messages.filter((m) => m.from === myRole).length;
    return (
      <div className="max-w-md mx-auto mt-16 text-center space-y-6">
        <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center">
          <span className="material-symbols-outlined text-white text-[40px]"
            style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 48" }}>check_circle</span>
        </div>
        <div>
          <p className="text-[20px] font-black text-text-pri">Session complete!</p>
          <p className="text-text-sec mt-1">You practiced as the <strong>{myRole}</strong></p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Duration",  value: timer },
            { label: "Exchanges", value: String(total) },
            { label: "Your msgs", value: String(myCount) },
          ].map((s) => (
            <div key={s.label} className="bg-surface border border-border rounded-xl p-3 text-center">
              <p className="text-[20px] font-black text-text-pri">{s.value}</p>
              <p className="text-[11px] text-text-muted mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
        {notes && (
          <div className="bg-bg-app border border-border rounded-xl p-4 text-left space-y-1">
            <p className="text-[12px] font-semibold text-text-muted uppercase tracking-wide">Your notes</p>
            <p className="text-[13px] text-text-pri whitespace-pre-wrap leading-relaxed">{notes}</p>
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={handleRestart}
            className="btn-gradient text-white px-6 py-2.5 rounded-btn font-semibold text-[14px] shadow-blue-glow hover:-translate-y-0.5 transition-all"
          >
            Practice again
          </button>
          <button
            onClick={handleSwitchRoles}
            className="px-5 py-2.5 border border-border rounded-btn text-[14px] font-semibold text-text-sec hover:bg-surface transition-colors"
          >
            Switch roles
          </button>
        </div>
      </div>
    );
  }

  // ── Active session ─────────────────────────────────────────────────────────
  const typeLabel = INTERVIEW_TYPES.find((t) => t.value === interviewType)?.label ?? interviewType;
  const peerRole: Role = myRole === "interviewer" ? "candidate" : "interviewer";

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] max-w-3xl">
      {/* Session header */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="px-3 py-1 rounded-full bg-blue/10 text-blue text-[11px] font-bold flex-shrink-0">{typeLabel}</span>
          <span className="text-[13px] font-semibold text-text-sec capitalize flex-shrink-0">You: {myRole}</span>
          <span className="font-mono text-[13px] text-[#F59E0B] font-bold flex-shrink-0">{timer}</span>
          {/* Partner status dot */}
          <span className={clsx(
            "flex items-center gap-1 text-[11px] font-semibold flex-shrink-0",
            partnerOnline ? "text-green-600" : "text-text-muted"
          )}>
            <span className={clsx("w-1.5 h-1.5 rounded-full", partnerOnline ? "bg-green-500" : "bg-border")} />
            {partnerOnline ? "Partner online" : "Partner offline"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Video call controls */}
          {rtc.callActive ? (
            <>
              <button onClick={rtc.toggleVideo} title={rtc.videoOn ? "Turn off camera" : "Turn on camera"}
                className={clsx("w-8 h-8 flex items-center justify-center rounded-lg border transition-colors",
                  rtc.videoOn ? "border-blue/40 text-blue bg-blue/5" : "border-border text-text-muted")}
              >
                <span className="material-symbols-outlined text-[16px]"
                  style={rtc.videoOn ? { fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" } : undefined}>
                  {rtc.videoOn ? "videocam" : "videocam_off"}
                </span>
              </button>
              <button onClick={rtc.toggleMute} title={rtc.muted ? "Unmute" : "Mute"}
                className={clsx("w-8 h-8 flex items-center justify-center rounded-lg border transition-colors",
                  rtc.muted ? "border-red/40 text-red bg-red-50" : "border-border text-text-muted")}
              >
                <span className="material-symbols-outlined text-[16px]"
                  style={!rtc.muted ? { fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" } : undefined}>
                  {rtc.muted ? "mic_off" : "mic"}
                </span>
              </button>
              <button onClick={rtc.hangUp}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-btn text-[12px] font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors">
                <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>call_end</span>
                <span className="hidden sm:inline">End call</span>
              </button>
            </>
          ) : (
            <button onClick={rtc.startCall} disabled={!partnerOnline} title="Start video call"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-btn text-[12px] font-semibold border border-green-300 text-green-700 hover:bg-green-50 transition-colors disabled:opacity-40">
              <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>video_call</span>
              <span className="hidden sm:inline">Video</span>
            </button>
          )}
          <button
            onClick={() => setNotesOpen((o) => !o)}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-btn text-[12px] font-semibold border transition-colors",
              notesOpen ? "bg-amber-50 border-amber-200 text-amber-700" : "border-border text-text-muted hover:border-blue/40"
            )}
          >
            <span className="material-symbols-outlined text-[15px]">edit_note</span>
            <span className="hidden sm:inline">Notes</span>
          </button>
          <button
            onClick={handleEnd}
            className="px-3 py-1.5 border border-red/40 text-red rounded-btn text-[12px] font-semibold hover:bg-red-50 transition-colors"
          >
            End
          </button>
        </div>
      </div>

      {/* Media permission error */}
      {rtc.mediaError && (
        <div className="flex items-center gap-2 mb-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-[12px] text-red-600 flex-shrink-0">
          <span className="material-symbols-outlined text-[16px] flex-shrink-0">videocam_off</span>
          <span className="flex-1">{rtc.mediaError}</span>
          <button onClick={() => rtc.hangUp()} className="text-red-400 hover:text-red-600">
            <span className="material-symbols-outlined text-[14px]">close</span>
          </button>
        </div>
      )}

      {/* Video panels — shown only when call is active */}
      {rtc.callActive && (
        <div className="flex gap-2 mb-2 flex-shrink-0">
          {/* Remote (partner) video — larger */}
          <div className="flex-1 relative bg-[#0F172A] rounded-xl overflow-hidden" style={{ height: 180 }}>
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <span className="absolute bottom-2 left-3 text-[10px] text-white/60 font-semibold capitalize">{myRole === "interviewer" ? "Candidate" : "Interviewer"}</span>
          </div>
          {/* Local (self) video — smaller PIP */}
          <div className="relative bg-[#0F172A] rounded-xl overflow-hidden flex-shrink-0" style={{ width: 120, height: 180 }}>
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
            <span className="absolute bottom-2 left-2 text-[10px] text-white/60 font-semibold">You</span>
            {!rtc.videoOn && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#0F172A]">
                <span className="material-symbols-outlined text-white/40 text-[28px]">videocam_off</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-1 gap-4 min-h-0">
        {/* Chat panel */}
        <div className="flex-1 flex flex-col bg-surface border border-border rounded-2xl overflow-hidden min-w-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="text-center text-[11px] text-text-muted pb-2">
              Room: <span className="font-mono font-bold tracking-widest">{roomCode}</span>
            </div>
            {messages.map((msg) => {
              if (msg.from === "system") {
                return (
                  <div key={msg.id} className="text-center">
                    <span className="text-[11px] text-text-muted bg-bg-app px-3 py-1 rounded-full">{msg.text}</span>
                  </div>
                );
              }
              const isMe = msg.from === myRole;
              return (
                <div key={msg.id} className={clsx("flex flex-col gap-1", isMe ? "items-end" : "items-start")}>
                  <span className="text-[10px] text-text-muted px-1 capitalize">{isMe ? "You" : peerRole} · {msg.time}</span>
                  <div className={clsx(
                    "max-w-[80%] px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed",
                    isMe
                      ? "bg-blue text-white rounded-br-none"
                      : "bg-bg-app border border-border text-text-pri rounded-bl-none"
                  )}>
                    {msg.text}
                  </div>
                </div>
              );
            })}
            <div ref={chatBottomRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-border flex-shrink-0">
            {myRole === "interviewer" && (
              <button
                onClick={handleSuggest}
                className="mb-2 flex items-center gap-1.5 text-[11px] text-blue font-semibold hover:underline"
              >
                <span className="material-symbols-outlined text-[13px]">auto_awesome</span>
                Suggest a question
              </button>
            )}
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder={myRole === "interviewer" ? "Ask a question…" : "Type your answer…"}
                className="flex-1 h-10 px-3 bg-bg-app border border-border rounded-xl text-[13px] text-text-pri
                           placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-blue/20 focus:border-blue/40 transition"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="w-10 h-10 flex items-center justify-center bg-blue text-white rounded-xl disabled:opacity-40 hover:bg-blue/90 transition-colors flex-shrink-0"
              >
                <span className="material-symbols-outlined text-[18px]"
                  style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>send</span>
              </button>
            </div>
          </div>
        </div>

        {/* Notes panel */}
        {notesOpen && (
          <div className="w-56 flex flex-col bg-surface border border-amber-200 rounded-2xl overflow-hidden flex-shrink-0">
            <div className="px-3 py-2.5 border-b border-amber-100 flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-600 text-[16px]">edit_note</span>
              <p className="text-[12px] font-bold text-text-pri">My Notes</p>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Jot down observations, feedback points, things to remember…"
              className="flex-1 p-3 bg-amber-50/40 text-[12px] text-text-pri placeholder:text-text-muted resize-none
                         focus:outline-none leading-relaxed"
            />
          </div>
        )}
      </div>
    </div>
  );
}
