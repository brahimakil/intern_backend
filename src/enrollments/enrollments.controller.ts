import { Controller, Get, Post, Put, Delete, Body, Param, HttpException, HttpStatus } from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';

@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Get()
  findAll() {
    return this.enrollmentsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.enrollmentsService.findOne(id);
  }

  @Post()
  async create(@Body() createEnrollmentDto: any) {
    try {
      return await this.enrollmentsService.create(createEnrollmentDto);
    } catch (error: any) {
      if (error.message === 'This student is already enrolled in this internship') {
        throw new HttpException(error.message, HttpStatus.CONFLICT);
      }
      if (error.message === 'Internship not found') {
        throw new HttpException(error.message, HttpStatus.NOT_FOUND);
      }
      throw new HttpException('Failed to create enrollment', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateEnrollmentDto: any) {
    return this.enrollmentsService.update(id, updateEnrollmentDto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.enrollmentsService.delete(id);
  }
}
