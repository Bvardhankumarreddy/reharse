import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ClerkGuard } from '../auth/clerk.guard';
import { CurrentUser, type ClerkUser } from '../auth/current-user.decorator';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';

@ApiTags('feedback')
@ApiBearerAuth()
@UseGuards(ClerkGuard)
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  /** GET /api/v1/feedback — all feedback for the authenticated user */
  @Get()
  findByUser(@CurrentUser() u: ClerkUser) {
    return this.feedback.findByUser(u.sub);
  }

  /** POST /api/v1/feedback — called by AI engine after evaluation */
  @Post()
  create(@CurrentUser() u: ClerkUser, @Body() dto: CreateFeedbackDto) {
    return this.feedback.create(dto, u.sub);
  }

  /** GET /api/v1/feedback/session/:sessionId — get feedback for a session */
  /** Must be declared BEFORE :id so NestJS doesn't match "session" as a UUID param */
  @Get('session/:sessionId')
  findBySession(
    @CurrentUser() u: ClerkUser,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.feedback.findBySession(sessionId, u.sub);
  }

  /** GET /api/v1/feedback/:id — get feedback by its own ID */
  @Get(':id')
  findById(
    @CurrentUser() u: ClerkUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.feedback.findById(id, u.sub);
  }
}
