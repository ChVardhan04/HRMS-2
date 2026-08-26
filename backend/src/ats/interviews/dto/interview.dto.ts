import {
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from "class-validator";

export class ScheduleInterviewDto {
  @IsUUID()
  candidateId: string;

  @IsString()
  round: string;

  @IsDateString()
  scheduledAt: string;

  @IsOptional()
  @IsInt()
  durationMin?: number;

  @IsArray()
  panelistIds: string[];
}

export class SubmitScorecardDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsString()
  strengths?: string;

  @IsOptional()
  @IsString()
  concerns?: string;

  @IsString()
  recommendation: "STRONG_YES" | "YES" | "NO" | "STRONG_NO";
}

export class CreateOfferDto {
  @IsUUID()
  candidateId: string;

  ctcOffered: number;

  @IsString()
  designationTitle: string;

  @IsDateString()
  joiningDate: string;
}
