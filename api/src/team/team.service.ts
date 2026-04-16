import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Team, TeamMember } from './team.entity';
import { User } from '../users/user.entity';

@Injectable()
export class TeamService {
  constructor(
    @InjectRepository(Team) private readonly teams: Repository<Team>,
    @InjectRepository(TeamMember) private readonly members: Repository<TeamMember>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async createTeam(ownerId: string, name: string, maxSeats = 10) {
    // Check if user already owns a team
    const existing = await this.teams.findOne({ where: { ownerId } });
    if (existing) throw new BadRequestException('You already own a team');

    const team = this.teams.create({ name, ownerId, maxSeats });
    const saved = await this.teams.save(team);

    // Add owner as first member
    const owner = await this.users.findOne({ where: { id: ownerId } });
    const member = this.members.create({
      teamId: saved.id,
      userId: ownerId,
      email: owner?.email ?? '',
      role: 'owner',
      status: 'active',
    });
    await this.members.save(member);

    return this.getTeam(saved.id, ownerId);
  }

  async getTeam(teamId: string, userId: string) {
    const team = await this.teams.findOne({
      where: { id: teamId },
      relations: ['owner', 'members', 'members.user'],
    });
    if (!team) throw new NotFoundException('Team not found');

    // Check membership
    const isMember = team.members.some((m) => m.userId === userId && m.status === 'active');
    if (!isMember && team.ownerId !== userId) {
      throw new ForbiddenException('Not a member of this team');
    }

    return {
      id: team.id,
      name: team.name,
      plan: team.plan,
      maxSeats: team.maxSeats,
      ownerId: team.ownerId,
      ownerEmail: team.owner?.email,
      createdAt: team.createdAt,
      members: team.members.map((m) => ({
        id: m.id,
        email: m.email,
        role: m.role,
        status: m.status,
        userId: m.userId,
        name: m.user
          ? [m.user.firstName, m.user.lastName].filter(Boolean).join(' ') || null
          : null,
        createdAt: m.createdAt,
      })),
    };
  }

  async getMyTeam(userId: string) {
    // Check if user owns a team
    const owned = await this.teams.findOne({ where: { ownerId: userId } });
    if (owned) return this.getTeam(owned.id, userId);

    // Check if user is a member of any team
    const membership = await this.members.findOne({
      where: { userId, status: 'active' },
    });
    if (membership) return this.getTeam(membership.teamId, userId);

    return null;
  }

  async inviteMember(teamId: string, ownerId: string, email: string) {
    const team = await this.teams.findOne({
      where: { id: teamId },
      relations: ['members'],
    });
    if (!team) throw new NotFoundException('Team not found');
    if (team.ownerId !== ownerId) throw new ForbiddenException('Only the team owner can invite members');

    const activeMembers = team.members.filter((m) => m.status !== 'removed');
    if (activeMembers.length >= team.maxSeats) {
      throw new BadRequestException(`Team is at capacity (${team.maxSeats} seats)`);
    }

    // Check if already invited
    const exists = team.members.find((m) => m.email === email && m.status !== 'removed');
    if (exists) throw new BadRequestException('This email is already on the team');

    // Check if user exists
    const user = await this.users.findOne({ where: { email } });

    const member = this.members.create({
      teamId,
      email,
      userId: user?.id ?? undefined,
      role: 'member',
      status: user ? 'active' : 'pending',
    });
    await this.members.save(member);

    // If user exists, grant them Pro access
    if (user) {
      await this.grantTeamPro(user.id);
    }

    return this.getTeam(teamId, ownerId);
  }

  async removeMember(teamId: string, ownerId: string, memberId: string) {
    const team = await this.teams.findOne({ where: { id: teamId } });
    if (!team) throw new NotFoundException('Team not found');
    if (team.ownerId !== ownerId) throw new ForbiddenException('Only the team owner can remove members');

    const member = await this.members.findOne({ where: { id: memberId, teamId } });
    if (!member) throw new NotFoundException('Member not found');
    if (member.role === 'owner') throw new BadRequestException('Cannot remove the team owner');

    member.status = 'removed';
    await this.members.save(member);

    return this.getTeam(teamId, ownerId);
  }

  async acceptInvite(userId: string, teamId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const member = await this.members.findOne({
      where: { teamId, email: user.email, status: 'pending' },
    });
    if (!member) throw new NotFoundException('No pending invite found');

    member.userId = userId;
    member.status = 'active';
    await this.members.save(member);

    await this.grantTeamPro(userId);

    return this.getTeam(teamId, userId);
  }

  private async grantTeamPro(userId: string) {
    await this.users.update(userId, {
      subscriptionTier: 'pro',
      subscriptionStatus: 'active',
    });
  }
}
