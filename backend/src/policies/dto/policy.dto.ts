import { IsDateString, IsOptional, IsString } from "class-validator";

export class CreatePolicyDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}

export class UpdatePolicyDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}
