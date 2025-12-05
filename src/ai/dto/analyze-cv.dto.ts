import { IsString, IsNotEmpty } from 'class-validator';

export class AnalyzeCVDto {
  @IsString()
  @IsNotEmpty()
  studentId: string;
}
