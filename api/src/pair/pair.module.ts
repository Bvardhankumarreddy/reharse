import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { PairGateway } from './pair.gateway';

@Module({
  imports:   [ConfigModule, TypeOrmModule.forFeature([User])],
  providers: [PairGateway],
})
export class PairModule {}
