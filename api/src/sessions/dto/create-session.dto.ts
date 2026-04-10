import { IsArray, IsEnum, IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSessionDto {
  @ApiProperty({ enum: ['behavioral', 'coding', 'system-design', 'hr', 'case-study'] })
  @IsEnum(['behavioral', 'coding', 'system-design', 'hr', 'case-study'])
  interviewType: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  targetRole?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  targetCompany?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  experienceLevel?: string;

  @ApiPropertyOptional({ enum: ['text', 'voice', 'mixed'] })
  @IsOptional()
  @IsEnum(['text', 'voice', 'mixed'])
  mode?: string;

  @ApiPropertyOptional({ minimum: 5, maximum: 120 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(120)
  durationMinutes?: number;

  @ApiPropertyOptional({ type: [String], description: 'Question bank IDs to use instead of AI generation' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  questionIds?: string[];
}
