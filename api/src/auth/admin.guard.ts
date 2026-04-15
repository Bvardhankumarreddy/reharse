import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import type { Request } from 'express';
import { User } from '../users/user.entity';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) throw new UnauthorizedException('No bearer token');

    let payload: jwt.JwtPayload;
    try {
      const secret = this.config.getOrThrow<string>('BETTER_AUTH_SECRET');
      payload = jwt.verify(token, secret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    const user = await this.users.findOne({ where: { id: payload.sub } });
    if (!user?.isAdmin) throw new ForbiddenException('Admin access required');

    (request as Request & { user: jwt.JwtPayload }).user = payload;
    return true;
  }
}
