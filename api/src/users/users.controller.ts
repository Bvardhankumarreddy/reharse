import {
  Controller,
  Get,
  Post,
  Patch,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ClerkGuard } from '../auth/clerk.guard';
import { CurrentUser, type ClerkUser } from '../auth/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(ClerkGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

  /** GET /api/v1/users/me — returns (or creates) the authenticated user */
  @Get('me')
  async getMe(@CurrentUser() clerkUser: ClerkUser) {
    return this.users.upsert(clerkUser);
  }

  /** POST /api/v1/users/me/resume — parse resume via AI engine, save extracted data */
  @Post('me/resume')
  @UseInterceptors(FileInterceptor('file'))
  async uploadResume(
    @CurrentUser() clerkUser: ClerkUser,
    @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string },
  ) {
    if (!file) throw new BadRequestException('No file provided');
    await this.users.upsert(clerkUser);
    const aiUrl = this.config.get<string>('AI_ENGINE_URL') ?? 'http://localhost:8000';
    return this.users.parseAndSaveResume(
      clerkUser.sub,
      { buffer: file.buffer, mimetype: file.mimetype, originalname: file.originalname },
      aiUrl,
    );
  }

  /** GET /api/v1/users/me/resume/versions — list all uploaded resume versions */
  @Get('me/resume/versions')
  async resumeVersions(@CurrentUser() clerkUser: ClerkUser) {
    return this.users.getResumeVersions(clerkUser.sub);
  }

  /** GET /api/v1/users/me/resume/download?key=resumes/... — presigned S3 URL (15 min TTL)
   *  Omit ?key to download the latest resume. */
  @Get('me/resume/download')
  async downloadResume(
    @CurrentUser() clerkUser: ClerkUser,
    @Query('key') key?: string,
  ): Promise<{ url: string }> {
    try {
      const url = await this.users.getResumeDownloadUrl(clerkUser.sub, key);
      return { url };
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new NotFoundException('Resume not available for download');
    }
  }

  /** PATCH /api/v1/users/me — update profile / onboarding prefs */
  @Patch('me')
  async updateMe(
    @CurrentUser() clerkUser: ClerkUser,
    @Body() dto: UpdateUserDto,
  ) {
    // Ensure user row exists
    await this.users.upsert(clerkUser);
    return this.users.update(clerkUser.sub, dto);
  }
}
