import { IsString, IsNotEmpty } from 'class-validator';

export class InternshipAssistantDto {
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @IsString()
  @IsNotEmpty()
  internshipId: string;

  @IsString()
  @IsNotEmpty()
  question: string;
}
