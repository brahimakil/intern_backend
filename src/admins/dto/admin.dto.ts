import { IsEmail, IsString, IsOptional, IsIn, MinLength } from 'class-validator';

export class CreateAdminDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  fullName?: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  @IsIn(['active', 'inactive'])
  @IsOptional()
  status?: 'active' | 'inactive';
}

export class UpdateAdminDto {
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  fullName?: string;

  @IsString()
  @MinLength(6)
  @IsOptional()
  password?: string;

  @IsString()
  @IsIn(['active', 'inactive'])
  @IsOptional()
  status?: 'active' | 'inactive';
}
