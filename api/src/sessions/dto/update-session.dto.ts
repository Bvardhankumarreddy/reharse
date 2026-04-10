import { IsEnum, IsOptional, IsInt, Min, Max, IsArray } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSessionDto {
  @ApiPropertyOptional({ enum: ['pending', 'active', 'completed', 'abandoned'] })
  @IsOptional()
  @IsEnum(['pending', 'active', 'completed', 'abandoned'])
  status?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  overallScore?: number;

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  transcript?: object[];
}
