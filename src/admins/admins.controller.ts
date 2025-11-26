import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { AdminsService } from './admins.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CreateAdminDto, UpdateAdminDto } from './dto/admin.dto';

@Controller('admins')
@UseGuards(FirebaseAuthGuard)
@UsePipes(new ValidationPipe({ 
  whitelist: true, 
  forbidNonWhitelisted: false,
  transform: true 
}))
export class AdminsController {
  constructor(private readonly adminsService: AdminsService) {}

  @Get()
  findAll() {
    return this.adminsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.adminsService.findOne(id);
  }

  @Post()
  create(@Body() createAdminDto: CreateAdminDto) {
    return this.adminsService.create(createAdminDto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateAdminDto: UpdateAdminDto) {
    return this.adminsService.update(id, updateAdminDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.adminsService.remove(id);
  }
}
