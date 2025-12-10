import { Controller, Get, Post, Put, Patch, Delete, Body, Param, UseGuards, UseInterceptors, UploadedFile, Req, HttpException, HttpStatus } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { StudentsService } from './students.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

@Controller('students')
@UseGuards(FirebaseAuthGuard)
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get('list/minimal')
  findAllMinimal() {
    return this.studentsService.findAllMinimal();
  }

  @Get()
  findAll() {
    return this.studentsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.studentsService.findOne(id);
  }

  @Post('register')
  async register(@Body() body: any, @Req() req: any) {
    try {
      return await this.studentsService.register(body, req.user);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post()
  create(@Body() createStudentDto: any) {
    return this.studentsService.create(createStudentDto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateStudentDto: any) {
    return this.studentsService.update(id, updateStudentDto);
  }

  @Patch(':id/gemini-key')
  async updateGeminiKey(@Param('id') id: string, @Body() body: { apiKey: string }) {
    return this.studentsService.updateGeminiKey(id, body.apiKey);
  }

  @Post(':id/cv')
  @UseInterceptors(FileInterceptor('file'))
  async uploadCV(
    @Param('id') id: string,
    @UploadedFile() file: any,
  ) {
    if (!file) {
      throw new Error('No file uploaded');
    }
    return this.studentsService.uploadCV(id, file);
  }

  @Post(':id/profile-photo')
  @UseInterceptors(FileInterceptor('file'))
  async uploadProfilePhoto(
    @Param('id') id: string,
    @UploadedFile() file: any,
  ) {
    if (!file) {
      throw new Error('No file uploaded');
    }
    return this.studentsService.uploadProfilePhoto(id, file);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.studentsService.remove(id);
  }
}

