import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwksClient } from 'jwks-rsa';
import * as jwt from 'jsonwebtoken';
import type { Request } from 'express';

@Injectable()
export class ClerkGuard implements CanActivate {
  private readonly jwksClient: JwksClient;

  constructor(private readonly config: ConfigService) {
    this.jwksClient = new JwksClient({
      jwksUri: config.getOrThrow<string>('CLERK_JWKS_URL'),
      cache: true,
      rateLimit: true,
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('No bearer token');

    try {
      const decoded = jwt.decode(token, { complete: true });
      if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
        throw new UnauthorizedException('Invalid token format');
      }

      const key = await this.jwksClient.getSigningKey(decoded.header.kid);
      const publicKey = key.getPublicKey();

      const payload = jwt.verify(token, publicKey, {
        algorithms: ['RS256'],
        // Clerk dev tokens use localhost as azp — skip audience/issuer checks here
        // and rely on the JWKS signature check alone
        ignoreExpiration: false,
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
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
    return null;
  }
}
