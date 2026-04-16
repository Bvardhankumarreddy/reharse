import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReferralController } from './referral.controller';
import { ReferralService } from './referral.service';
import { Referral } from './referral.entity';
import { User } from '../users/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Referral, User])],
  controllers: [ReferralController],
  providers: [ReferralService],
})
export class ReferralModule {}
