import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { InternshipsService } from './internships.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

@Controller('internships')
@UseGuards(FirebaseAuthGuard)
export class InternshipsController {
  constructor(private readonly internshipsService: InternshipsService) {}

  @Get()
  findAll() {
    return this.internshipsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.internshipsService.findOne(id);
  }

  @Post()
  create(@Body() createInternshipDto: any) {
    return this.internshipsService.create(createInternshipDto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateInternshipDto: any) {
    return this.internshipsService.update(id, updateInternshipDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.internshipsService.remove(id);
  }
}

