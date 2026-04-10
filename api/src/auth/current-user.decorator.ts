import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from 'jsonwebtoken';
import type { Request } from 'express';

export interface ClerkUser {
  sub: string;           // Clerk user ID (e.g. "user_abc123")
  email?: string;
  firstName?: string;
  lastName?: string;
  imageUrl?: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ClerkUser => {
    const request = ctx.switchToHttp().getRequest<Request & { user: JwtPayload }>();
    const payload = request.user;
    return {
      sub:       payload.sub ?? '',
      email:     payload['email'] as string | undefined,
      firstName: payload['first_name'] as string | undefined,
      lastName:  payload['last_name'] as string | undefined,
      imageUrl:  payload['image_url'] as string | undefined,
    };
  },
);
