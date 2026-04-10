import { IsUUID, IsInt, Min, Max, IsString, IsArray, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateFeedbackDto {
  @ApiProperty() @IsUUID()
  sessionId: string;

  @ApiProperty({ minimum: 0, maximum: 100 }) @IsInt() @Min(0) @Max(100)
  overallScore: number;

  @ApiProperty() @IsObject()
  dimensionScores: Record<string, number>;

  @ApiProperty() @IsString()
  summary: string;

  @ApiProperty({ type: [Object] }) @IsArray()
  questionFeedback: object[];

  @ApiProperty({ type: [Object] }) @IsArray()
  nextSteps: object[];

  @ApiProperty({ type: [String] }) @IsArray()
  weakAreas: string[];

  @ApiProperty({ required: false }) @IsString()
  modelUsed?: string;
}
