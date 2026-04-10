import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from 'jsonwebtoken';
import type { Request } from 'express';

export interface ClerkUser {
  sub: string;        // Better Auth user ID
  email?: string;
  firstName?: string;
  lastName?: string;
  imageUrl?: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ClerkUser => {
    const request = ctx.switchToHttp().getRequest<Request & { user: JwtPayload }>();
    const payload = request.user;

    // Better Auth JWT plugin emits `name` (full name) and `image`.
    // Split name into firstName/lastName for the service layer.
    const fullName  = (payload['name'] as string | undefined) ?? '';
    const spaceIdx  = fullName.indexOf(' ');
    const firstName = spaceIdx > -1 ? fullName.slice(0, spaceIdx) : fullName || undefined;
    const lastName  = spaceIdx > -1 ? fullName.slice(spaceIdx + 1) || undefined : undefined;

    return {
      sub:       payload.sub ?? '',
      email:     payload['email'] as string | undefined,
      firstName,
      lastName,
      imageUrl:  (payload['image'] as string | undefined),
    };
  },
);
