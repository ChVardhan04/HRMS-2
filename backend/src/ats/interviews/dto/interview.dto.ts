import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
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

  // Previously unvalidated: any JSON value reached the Decimal column.
  @IsNumber()
  @IsPositive()
  ctcOffered: number;

  @IsString()
  designationTitle: string;

  @IsDateString()
  joiningDate: string;
}

/**
 * The offer-response body must be a real boolean. Reading it with
 * @Body("accepted") bypassed the global ValidationPipe entirely, so the
 * string "false" arrived truthy and a decline was recorded as an ACCEPTANCE.
 */
export class OfferResponseDto {
  @IsBoolean()
  accepted: boolean;
}
