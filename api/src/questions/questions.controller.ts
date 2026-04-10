import {
  Controller,
  Get,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ClerkGuard } from '../auth/clerk.guard';
import { QuestionsService } from './questions.service';
import { QuestionFilterDto } from './dto/question-filter.dto';

@ApiTags('questions')
@ApiBearerAuth()
@UseGuards(ClerkGuard)
@Controller('questions')
export class QuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  @Get()
  findAll(@Query() filter: QuestionFilterDto) {
    return this.questions.findAll(filter);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.questions.findOne(id);
  }
}
