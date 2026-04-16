import { Controller, Get, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ClerkGuard } from '../auth/clerk.guard';
import { CurrentUser, type ClerkUser } from '../auth/current-user.decorator';
import { TeamService } from './team.service';

@ApiTags('teams')
@ApiBearerAuth()
@UseGuards(ClerkGuard)
@Controller('teams')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  /** GET /api/v1/teams/me — get my team (owned or member) */
  @Get('me')
  getMyTeam(@CurrentUser() user: ClerkUser) {
    return this.teamService.getMyTeam(user.sub);
  }

  /** POST /api/v1/teams — create a new team */
  @Post()
  createTeam(
    @CurrentUser() user: ClerkUser,
    @Body() body: { name: string; maxSeats?: number },
  ) {
    return this.teamService.createTeam(user.sub, body.name, body.maxSeats);
  }

  /** GET /api/v1/teams/:id — get team details */
  @Get(':id')
  getTeam(@Param('id') id: string, @CurrentUser() user: ClerkUser) {
    return this.teamService.getTeam(id, user.sub);
  }

  /** POST /api/v1/teams/:id/invite — invite a member by email */
  @Post(':id/invite')
  inviteMember(
    @Param('id') id: string,
    @CurrentUser() user: ClerkUser,
    @Body() body: { email: string },
  ) {
    return this.teamService.inviteMember(id, user.sub, body.email);
  }

  /** DELETE /api/v1/teams/:id/members/:memberId — remove a member */
  @Delete(':id/members/:memberId')
  removeMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: ClerkUser,
  ) {
    return this.teamService.removeMember(id, user.sub, memberId);
  }

  /** POST /api/v1/teams/:id/accept — accept a team invite */
  @Post(':id/accept')
  acceptInvite(@Param('id') id: string, @CurrentUser() user: ClerkUser) {
    return this.teamService.acceptInvite(user.sub, id);
  }
}
