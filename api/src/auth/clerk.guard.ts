import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import type { Request } from 'express';

/**
 * Validates HS256 JWTs issued by the Next.js /api/auth/token endpoint
 * (Better Auth jwt plugin, signed with BETTER_AUTH_SECRET).
 * Kept named ClerkGuard so all existing @UseGuards(ClerkGuard) imports
 * continue to work without touching every controller.
 */
@Injectable()
export class ClerkGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('No bearer token');

    try {
      const secret = this.config.getOrThrow<string>('BETTER_AUTH_SECRET');
      const payload = jwt.verify(token, secret, {
        algorithms: ['HS256'],
      }) as jwt.JwtPayload;

      (request as Request & { user: jwt.JwtPayload }).user = payload;
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      throw new UnauthorizedException(`Invalid or expired token: ${msg}`);
    }
  }

  private extractToken(request: Request): string | null {
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
    return null;
  }
}
