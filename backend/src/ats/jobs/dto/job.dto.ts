import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
} from "class-validator";

export class CreateJobRequisitionDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  departmentName?: string;

  @IsOptional()
  @IsArray()
  skillsRequired?: string[];

  @IsOptional()
  @IsString()
  seniority?: string;

  @IsOptional()
  @IsNumber()
  ctcBandMin?: number;

  @IsOptional()
  @IsNumber()
  ctcBandMax?: number;

  @IsOptional()
  @IsInt()
  headcount?: number;

  @IsOptional()
  @IsString()
  jobDescription?: string;
}
