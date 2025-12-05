import { Controller, Post, Body, UseGuards, Delete, Param } from '@nestjs/common';
import { AiService } from './ai.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { ChatDto } from './dto/chat.dto';
import { AnalyzeCVDto } from './dto/analyze-cv.dto';
import { InternshipAssistantDto } from './dto/internship-assistant.dto';

@Controller('ai')
@UseGuards(FirebaseAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  async chat(@Body() chatDto: ChatDto) {
    return this.aiService.chat(chatDto);
  }

  @Delete('chat/:studentId')
  async clearChat(@Param('studentId') studentId: string) {
    return this.aiService.clearChatHistory(studentId);
  }

  @Post('analyze-cv')
  async analyzeCV(@Body() analyzeCVDto: AnalyzeCVDto) {
    return this.aiService.analyzeCV(analyzeCVDto);
  }

  @Post('internship-assistant')
  async internshipAssistant(@Body() internshipAssistantDto: InternshipAssistantDto) {
    return this.aiService.internshipAssistant(internshipAssistantDto);
  }
}
