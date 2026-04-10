import { Controller, Post, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ClerkGuard } from '../auth/clerk.guard';
import { CurrentUser, type ClerkUser } from '../auth/current-user.decorator';
import { UserFeedbackService } from './user-feedback.service';

@ApiTags('user-feedback')
@ApiBearerAuth()
@UseGuards(ClerkGuard)
@Controller('user-feedback')
export class UserFeedbackController {
  constructor(private readonly service: UserFeedbackService) {}

  @Post()
  submit(
    @CurrentUser() user: ClerkUser,
    @Body('rating')   rating:   number | undefined,
    @Body('category') category: string | undefined,
    @Body('message')  message:  string,
  ) {
    if (!message?.trim()) throw new BadRequestException('message is required');
    return this.service.submit(user.sub, { rating, category, message: message.trim() });
  }
}
