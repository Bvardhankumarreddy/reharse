import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ClerkGuard } from '../auth/clerk.guard';
import { CurrentUser, type ClerkUser } from '../auth/current-user.decorator';
import { SessionsService } from './sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';

@ApiTags('sessions')
@ApiBearerAuth()
@UseGuards(ClerkGuard)
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post()
  create(@CurrentUser() u: ClerkUser, @Body() dto: CreateSessionDto) {
    return this.sessions.create(u.sub, dto);
  }

  @Get()
  findAll(@CurrentUser() u: ClerkUser) {
    return this.sessions.findAllForUser(u.sub);
  }

  @Get(':id')
  findOne(
    @CurrentUser() u: ClerkUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sessions.findOne(id, u.sub);
  }

  @Patch(':id')
  update(
    @CurrentUser() u: ClerkUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSessionDto,
  ) {
    return this.sessions.update(id, u.sub, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentUser() u: ClerkUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sessions.delete(id, u.sub);
  }
}
