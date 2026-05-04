import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompetitorChannel, CompetitorNote } from './competitor.entity';
import type { SocialPlatform } from './social-post.entity';

@Injectable()
export class CompetitorService {
  constructor(
    @InjectRepository(CompetitorChannel) private readonly competitors: Repository<CompetitorChannel>,
    @InjectRepository(CompetitorNote) private readonly notes: Repository<CompetitorNote>,
  ) {}

  async list() {
    return this.competitors.find({
      relations: ['notes'],
      order: { platform: 'ASC', displayName: 'ASC' },
    });
  }

  async create(body: Partial<CompetitorChannel>) {
    const c = this.competitors.create({
      platform: body.platform!,
      handle: body.handle ?? '',
      displayName: body.displayName ?? body.handle ?? 'Unnamed',
      url: body.url ?? null,
      followerCount: body.followerCount ?? null,
      followerCountUpdatedAt: body.followerCount != null ? new Date() : null,
      description: body.description ?? null,
    });
    return this.competitors.save(c);
  }

  async update(id: string, body: Partial<CompetitorChannel>) {
    const c = await this.competitors.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Competitor not found');
    if (body.handle !== undefined) c.handle = body.handle;
    if (body.displayName !== undefined) c.displayName = body.displayName;
    if (body.url !== undefined) c.url = body.url;
    if (body.description !== undefined) c.description = body.description;
    if (body.followerCount !== undefined && body.followerCount !== c.followerCount) {
      c.followerCount = body.followerCount;
      c.followerCountUpdatedAt = new Date();
    }
    return this.competitors.save(c);
  }

  async remove(id: string) {
    const c = await this.competitors.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Competitor not found');
    await this.competitors.remove(c);
    return { deleted: true };
  }

  async addNote(competitorId: string, content: string, referenceUrl: string | null, authorEmail: string) {
    const c = await this.competitors.findOne({ where: { id: competitorId } });
    if (!c) throw new NotFoundException('Competitor not found');
    const note = this.notes.create({ competitorId, content, referenceUrl, authorEmail });
    return this.notes.save(note);
  }

  async deleteNote(noteId: string) {
    const n = await this.notes.findOne({ where: { id: noteId } });
    if (!n) throw new NotFoundException('Note not found');
    await this.notes.remove(n);
    return { deleted: true };
  }

  async listByPlatform(platform: SocialPlatform) {
    return this.competitors.find({
      where: { platform },
      relations: ['notes'],
      order: { displayName: 'ASC' },
    });
  }
}
