import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';
import { Team, TeamMember } from './team.entity';
import { User } from '../users/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Team, TeamMember, User])],
  controllers: [TeamController],
  providers: [TeamService],
})
export class TeamModule {}
