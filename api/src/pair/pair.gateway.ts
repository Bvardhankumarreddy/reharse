import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import { Server, Socket } from 'socket.io';
import { User } from '../users/user.entity';

// ── Room state ────────────────────────────────────────────────────────────────

interface PairRoom {
  code:          string;
  hostSocketId:  string;
  guestSocketId: string | null;
  interviewType: string;
  createdAt:     number;
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ── Events ────────────────────────────────────────────────────────────────────

export const PAIR_EVENTS = {
  // Server → Client
  PARTNER_JOINED:  'pair:partner_joined',
  PARTNER_LEFT:    'pair:partner_left',
  MESSAGE:         'pair:message',
  ERROR:           'pair:error',
  WEBRTC_OFFER:    'pair:webrtc_offer',
  WEBRTC_ANSWER:   'pair:webrtc_answer',
  WEBRTC_ICE:      'pair:webrtc_ice',
  // Client → Server
  CREATE_ROOM:     'pair:create_room',
  JOIN_ROOM:       'pair:join_room',
  SEND_MESSAGE:    'pair:message',
  LEAVE_ROOM:      'pair:leave_room',
} as const;

/** Free users may create at most this many rooms per calendar day */
const FREE_DAILY_ROOM_LIMIT = 2;

// ── Gateway ───────────────────────────────────────────────────────────────────

@WebSocketGateway({
  namespace: '/pair',
  cors: { origin: true, credentials: true },
})
export class PairGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger       = new Logger(PairGateway.name);
  private readonly rooms        = new Map<string, PairRoom>(); // code   → room
  private readonly socketToCode = new Map<string, string>();   // sockId → code
  private readonly socketToUser = new Map<string, string>();   // sockId → userId
  private readonly socketToTier = new Map<string, string>();   // sockId → 'free'|'pro'

  /**
   * Daily room-creation counter for free users.
   * Key: `${userId}:${YYYY-MM-DD}` — auto-cleared when the value reaches 0 on a new day.
   */
  private readonly dailyRooms  = new Map<string, number>();

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  // ── Connection lifecycle ───────────────────────────────────────────────────

  async handleConnection(socket: Socket) {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) throw new Error('No token');

      const secret  = this.config.getOrThrow<string>('BETTER_AUTH_SECRET');
      const payload = jwt.verify(token, secret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
      const userId  = payload.sub as string;

      // Look up subscription tier from DB
      const user = await this.userRepo.findOne({
        where:  { id: userId },
        select: ['id', 'subscriptionTier', 'subscriptionStatus', 'subscriptionEndsAt'],
      });

      const isProActive = user?.subscriptionTier === 'pro' &&
        (user.subscriptionStatus === 'active' ||
          (user.subscriptionStatus === 'day_pass' &&
            (!user.subscriptionEndsAt || user.subscriptionEndsAt > new Date())));
      const tier = isProActive ? 'pro' : 'free';

      this.socketToUser.set(socket.id, userId);
      this.socketToTier.set(socket.id, tier);
      this.logger.log(`[Pair] Connected: ${socket.id} (user ${userId}, tier ${tier})`);
    } catch (err) {
      this.logger.warn(`[Pair] Rejected socket ${socket.id}: ${(err as Error).message}`);
      socket.emit(PAIR_EVENTS.ERROR, { message: 'Authentication failed. Please reload and try again.' });
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket) {
    const code = this.socketToCode.get(socket.id);

    this.socketToCode.delete(socket.id);
    this.socketToUser.delete(socket.id);
    this.socketToTier.delete(socket.id);

    if (!code) return;

    socket.to(code).emit(PAIR_EVENTS.PARTNER_LEFT);

    const room = this.rooms.get(code);
    if (!room) return;

    if (room.hostSocketId === socket.id) {
      if (room.guestSocketId) {
        room.hostSocketId  = room.guestSocketId;
        room.guestSocketId = null;
      } else {
        this.rooms.delete(code);
      }
    } else {
      room.guestSocketId = null;
    }

    this.logger.log(`[Pair] ${socket.id} disconnected from room ${code}`);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private todayKey(userId: string): string {
    return `${userId}:${new Date().toISOString().slice(0, 10)}`; // YYYY-MM-DD
  }

  private isPro(socket: Socket): boolean {
    return this.socketToTier.get(socket.id) === 'pro';
  }

  private checkRateLimit(socket: Socket): { allowed: boolean; message?: string } {
    if (this.isPro(socket)) return { allowed: true };

    const userId = this.socketToUser.get(socket.id);
    if (!userId) return { allowed: false, message: 'Not authenticated.' };

    const key   = this.todayKey(userId);
    const count = this.dailyRooms.get(key) ?? 0;

    if (count >= FREE_DAILY_ROOM_LIMIT) {
      return {
        allowed: false,
        message: `Free users can create up to ${FREE_DAILY_ROOM_LIMIT} pair rooms per day. Upgrade to Pro for unlimited sessions.`,
      };
    }

    return { allowed: true };
  }

  private incrementRateLimit(socket: Socket) {
    if (this.isPro(socket)) return;
    const userId = this.socketToUser.get(socket.id);
    if (!userId) return;
    const key = this.todayKey(userId);
    this.dailyRooms.set(key, (this.dailyRooms.get(key) ?? 0) + 1);
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  /** Create a new room as host */
  @SubscribeMessage(PAIR_EVENTS.CREATE_ROOM)
  handleCreateRoom(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { interviewType?: string },
  ) {
    // Pro check + rate limit
    const { allowed, message } = this.checkRateLimit(socket);
    if (!allowed) return { error: message };

    // Clean stale rooms (older than 2 hours) to avoid memory leaks
    const twoHoursAgo = Date.now() - 7_200_000;
    for (const [code, room] of this.rooms.entries()) {
      if (room.createdAt < twoHoursAgo) this.rooms.delete(code);
    }

    let code = generateCode();
    while (this.rooms.has(code)) code = generateCode();

    const room: PairRoom = {
      code,
      hostSocketId:  socket.id,
      guestSocketId: null,
      interviewType: data?.interviewType ?? 'behavioral',
      createdAt:     Date.now(),
    };

    this.rooms.set(code, room);
    this.socketToCode.set(socket.id, code);
    socket.join(code);
    this.incrementRateLimit(socket);

    this.logger.log(`[Pair] Room ${code} created by ${socket.id} (${room.interviewType})`);
    return { code };
  }

  /** Join an existing room as guest */
  @SubscribeMessage(PAIR_EVENTS.JOIN_ROOM)
  handleJoinRoom(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { code: string },
  ) {
    const code = (data?.code ?? '').toUpperCase().trim();
    const room = this.rooms.get(code);

    if (!room)                           return { error: 'Room not found. Check the code and try again.' };
    if (room.guestSocketId)              return { error: 'Room is already full.' };
    if (room.hostSocketId === socket.id) return { error: 'You cannot join your own room.' };

    room.guestSocketId = socket.id;
    this.socketToCode.set(socket.id, code);
    socket.join(code);

    socket.to(code).emit(PAIR_EVENTS.PARTNER_JOINED, { interviewType: room.interviewType });

    this.logger.log(`[Pair] ${socket.id} joined room ${code}`);
    return { ok: true, interviewType: room.interviewType };
  }

  /** Relay a chat message to the other peer in the same room */
  @SubscribeMessage(PAIR_EVENTS.SEND_MESSAGE)
  handleMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { text: string },
  ) {
    const code = this.socketToCode.get(socket.id);
    if (!code || !data?.text) return;
    socket.to(code).emit(PAIR_EVENTS.MESSAGE, { text: data.text });
  }

  // ── WebRTC signaling relay ─────────────────────────────────────────────────
  // The gateway is a pure relay — it never inspects SDP or ICE payloads.

  @SubscribeMessage(PAIR_EVENTS.WEBRTC_OFFER)
  handleWebRtcOffer(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { sdp: RTCSessionDescriptionInit },
  ) {
    const code = this.socketToCode.get(socket.id);
    if (!code || !data?.sdp) return;
    socket.to(code).emit(PAIR_EVENTS.WEBRTC_OFFER, { sdp: data.sdp });
  }

  @SubscribeMessage(PAIR_EVENTS.WEBRTC_ANSWER)
  handleWebRtcAnswer(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { sdp: RTCSessionDescriptionInit },
  ) {
    const code = this.socketToCode.get(socket.id);
    if (!code || !data?.sdp) return;
    socket.to(code).emit(PAIR_EVENTS.WEBRTC_ANSWER, { sdp: data.sdp });
  }

  @SubscribeMessage(PAIR_EVENTS.WEBRTC_ICE)
  handleWebRtcIce(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { candidate: RTCIceCandidateInit },
  ) {
    const code = this.socketToCode.get(socket.id);
    if (!code || !data?.candidate) return;
    socket.to(code).emit(PAIR_EVENTS.WEBRTC_ICE, { candidate: data.candidate });
  }

  /** Gracefully leave the room */
  @SubscribeMessage(PAIR_EVENTS.LEAVE_ROOM)
  handleLeaveRoom(@ConnectedSocket() socket: Socket) {
    const code = this.socketToCode.get(socket.id);
    if (!code) return;

    socket.to(code).emit(PAIR_EVENTS.PARTNER_LEFT);
    socket.leave(code);
    this.socketToCode.delete(socket.id);

    const room = this.rooms.get(code);
    if (!room) return;
    if (room.guestSocketId === socket.id) {
      room.guestSocketId = null;
    } else {
      this.rooms.delete(code);
    }
  }
}
