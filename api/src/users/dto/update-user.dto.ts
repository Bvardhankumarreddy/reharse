import { IsOptional, IsString, IsIn, IsBoolean, IsObject, IsArray, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional() @IsOptional() @IsString()
  firstName?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  lastName?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  imageUrl?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  targetRole?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  targetCompany?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  experienceLevel?: string;

  @ApiPropertyOptional({ enum: ['job_search', 'promotion', 'career_change', 'explore'] })
  @IsOptional()
  @IsIn(['job_search', 'promotion', 'career_change', 'explore'])
  goalType?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  resumeUrl?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  companyType?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  onboardingCompleted?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsObject()
  preferences?: {
    mode?: string;
    adaptive?: boolean;
    starHints?: boolean;
    feedbackDepth?: string;
  };

  @ApiPropertyOptional() @IsOptional() @IsObject()
  notificationPreferences?: {
    daily?: boolean;
    weekly?: boolean;
    newQ?: boolean;
    aiCoach?: boolean;
    session?: boolean;
  };

  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true })
  targetCompanies?: string[];

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  interviewDate?: string;
}
