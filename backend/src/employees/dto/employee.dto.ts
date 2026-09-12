import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsNumber,
  IsString,
  MinLength,
  IsUUID,
  IsArray,
} from "class-validator";
import { EmploymentStatus, EmploymentType, RoleName } from "@prisma/client";
import { PaginationDto } from "../../common/dto/pagination.dto";

export class CreateEmployeeDto {
  @IsEmail()
  email: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsOptional()
  @IsEmail()
  personalEmail?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  emergencyContact?: string;

  @IsOptional()
  @IsString()
  emergencyAddress?: string;

  @IsDateString()
  dateOfJoining: string;

  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  designationId?: string;

  @IsOptional()
  @IsUUID()
  managerId?: string;

  @IsOptional()
  @IsUUID()
  skipLevelManagerId?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  monthlySalary?: number;

  @IsOptional()
  @IsString()
  salaryCurrency?: string;

  @IsOptional()
  @IsBoolean()
  payrollEligible?: boolean;

  @IsOptional()
  @IsArray()
  @IsEnum(RoleName, { each: true })
  roleNames?: RoleName[];
}

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsEmail()
  personalEmail?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  emergencyContact?: string;

  @IsOptional()
  @IsString()
  emergencyAddress?: string;

  @IsOptional()
  @IsDateString()
  dateOfJoining?: string;

  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @IsOptional()
  @IsEnum(EmploymentStatus)
  employmentStatus?: EmploymentStatus;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  designationId?: string;

  @IsOptional()
  @IsUUID()
  managerId?: string;

  @IsOptional()
  @IsUUID()
  skipLevelManagerId?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsDateString()
  exitDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  monthlySalary?: number;

  @IsOptional()
  @IsString()
  salaryCurrency?: string;

  @IsOptional()
  @IsBoolean()
  payrollEligible?: boolean;

  @IsOptional()
  @IsArray()
  @IsEnum(RoleName, { each: true })
  roleNames?: RoleName[];
}

export class EmployeeQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsEnum(EmploymentStatus)
  employmentStatus?: EmploymentStatus;

  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  includeExited?: boolean;
}
