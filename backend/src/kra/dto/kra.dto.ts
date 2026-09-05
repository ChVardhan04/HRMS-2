import { IsArray, IsBoolean, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
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
  // These drive AI evaluation but were missing from the DTO, so with the global
  // forbidNonWhitelisted pipe any request that sent them was rejected with 400
  // and metrics added via the API could never specify their evidence source.
  @IsOptional() @IsString() evidenceSource?: string;
  @IsOptional() @IsString() evaluationMethod?: string;
}

/** Weight freed by deleting a metric must be reassigned so the template still totals 100%. */
export class RedistributeWeightDto {
  @IsUUID() itemId: string;
  @IsNumber() @Min(0) @Max(100) weightPercent: number;
}

export class DeleteKraItemDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RedistributeWeightDto)
  redistribute?: RedistributeWeightDto[];
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
