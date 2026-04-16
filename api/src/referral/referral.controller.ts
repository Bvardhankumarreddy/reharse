import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ClerkGuard } from '../auth/clerk.guard';
import { CurrentUser, type ClerkUser } from '../auth/current-user.decorator';
import { ReferralService } from './referral.service';

@ApiTags('referrals')
@ApiBearerAuth()
@UseGuards(ClerkGuard)
@Controller('referrals')
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  /** GET /api/v1/referrals — get my referral code and stats */
  @Get()
  getMyReferrals(@CurrentUser() user: ClerkUser) {
    return this.referralService.getMyReferrals(user.sub);
  }

  /** POST /api/v1/referrals/apply — apply a referral code */
  @Post('apply')
  applyCode(
    @CurrentUser() user: ClerkUser,
    @Body() body: { code: string },
  ) {
    return this.referralService.applyReferralCode(user.sub, body.code);
  }
}
