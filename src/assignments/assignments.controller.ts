import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Patch,
  Delete, 
  Body, 
  Param, 
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { AssignmentsService } from './assignments.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { SubmitAssignmentDto } from './dto/submit-assignment.dto';
import { ReviewAssignmentDto } from './dto/review-assignment.dto';

@Controller('assignments')
@UseGuards(FirebaseAuthGuard)
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  @Get()
  findAll() {
    return this.assignmentsService.findAll();
  }

  @Get('student/:studentId')
  findByStudent(@Param('studentId') studentId: string) {
    return this.assignmentsService.findByStudent(studentId);
  }

  @Get('internship/:internshipId')
  findByInternship(@Param('internshipId') internshipId: string) {
    return this.assignmentsService.findByInternship(internshipId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.assignmentsService.findOne(id);
  }

  @Post()
  create(@Body() createAssignmentDto: CreateAssignmentDto) {
    return this.assignmentsService.create(createAssignmentDto);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateAssignmentDto: UpdateAssignmentDto,
  ) {
    return this.assignmentsService.update(id, updateAssignmentDto);
  }

  @Patch(':id/submit')
  async submit(
    @Param('id') id: string,
    @Body() submitAssignmentDto: SubmitAssignmentDto,
  ) {
    try {
      return await this.assignmentsService.submit(id, submitAssignmentDto);
    } catch (error: any) {
      if (error.message === 'Assignment not found') {
        throw new HttpException(error.message, HttpStatus.NOT_FOUND);
      }
      throw new HttpException('Failed to submit assignment', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Patch(':id/review')
  async review(
    @Param('id') id: string,
    @Body() reviewAssignmentDto: ReviewAssignmentDto,
  ) {
    try {
      return await this.assignmentsService.review(id, reviewAssignmentDto);
    } catch (error: any) {
      if (error.message === 'Assignment not found') {
        throw new HttpException(error.message, HttpStatus.NOT_FOUND);
      }
      if (error.message === 'Assignment must be submitted before review') {
        throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
      }
      throw new HttpException('Failed to review assignment', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.assignmentsService.delete(id);
  }
}
