import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Character } from './entities/character.entity';
import { CharacterDictionaryService } from './services/character-dictionary.service';
import { CharacterCastingService } from './services/character-casting.service';

/**
 * Shared characters module. Imported by AQB + AI Pulse so both modules
 * share the same recurring cartoon cast. The dictionary auto-seeds on
 * boot from data/seed.ts.
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Character]),
  ],
  providers: [
    CharacterDictionaryService,
    CharacterCastingService,
  ],
  exports: [
    CharacterDictionaryService,
    CharacterCastingService,
  ],
})
export class CharactersModule {}
