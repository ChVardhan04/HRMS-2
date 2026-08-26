import {
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from "class-validator";
import { CandidateSource, CandidateStage } from "@prisma/client";
import { PaginationDto } from "../../../common/dto/pagination.dto";

export class CreateCandidateDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsArray()
  skills?: string[];

  @IsOptional()
  experienceYears?: number;

  @IsOptional()
  @IsEnum(CandidateSource)
  source?: CandidateSource;

  @IsOptional()
  @IsUUID()
  jobPostingId?: string;
}

export class MoveStageDto {
  @IsEnum(CandidateStage)
  stage: CandidateStage;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CandidateQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(CandidateStage)
  stage?: CandidateStage;

  @IsOptional()
  @IsUUID()
  recruiterId?: string;
}

export class BulkCandidateActionDto {
  @IsArray()
  candidateIds: string[];

  @IsString()
  action:
    | "change_stage"
    | "assign_recruiter"
    | "assign_hiring_manager"
    | "reject"
    | "create_follow_up";

  @IsOptional()
  payload?: Record<string, any>;
}
