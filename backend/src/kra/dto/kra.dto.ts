import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from "class-validator";
import { KraMeasurementType } from "@prisma/client";

export class CreateKraTemplateDto {
  @IsString() name: string;
  @IsString() roleName: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() designationId?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class KraItemDto {
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsNumber() @Min(0) @Max(100) weightPercent: number;
  @IsEnum(KraMeasurementType) measurementType: KraMeasurementType;
  @IsOptional() @IsNumber() targetValue?: number;
  @IsOptional() @IsString() targetText?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsBoolean() isAutomated?: boolean;
  @IsOptional() @IsNumber() sortOrder?: number;
}

export class GenerateKraMetricsDto {
  @IsString() roleName: string;
  @IsString() roleProfile: string;
}

export class ConfigureKraTemplateDto {
  @IsUUID() departmentId: string;
  @IsUUID() designationId: string;
  @IsString() roleName: string;
  @IsString() roleProfile: string;
}
