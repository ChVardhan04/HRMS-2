import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class UpsertDprEntryDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  todoId?: string;

  @IsOptional()
  @IsString()
  project?: string;

  @IsString()
  description: string;

  @IsNumber()
  hours: number;

  @IsOptional()
  @IsString()
  output?: string;

  @IsOptional()
  @IsString()
  blocker?: string;

  @IsOptional()
  @IsString()
  tomorrowPlan?: string;
}

export class SaveDprDraftDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertDprEntryDto)
  entries: UpsertDprEntryDto[];
}

export class ReviewDprDto {
  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsNumber()
  qualityScore?: number;
}

export class UnlockDprDto {
  @IsString()
  reason: string;
}
