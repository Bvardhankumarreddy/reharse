import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Unique,
} from 'typeorm';
import type { SocialPlatform } from './social-post.entity';

@Entity('social_platform_connections')
@Unique('uq_platform', ['platform'])
export class SocialPlatformConnection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  platform: SocialPlatform;

  /** LinkedIn URN (e.g., 'urn:li:person:abc' or organization id) */
  @Column({ type: 'text' })
  accountId: string;

  @Column({ type: 'text', nullable: true })
  accountName: string | null;

  /** Encrypted with AES-256-GCM via SocialAgentEncryptionService */
  @Column({ type: 'text' })
  encryptedAccessToken: string;

  @Column({ type: 'text', nullable: true })
  encryptedRefreshToken: string | null;

  @Column({ type: 'timestamptz' })
  tokenExpiresAt: Date;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
