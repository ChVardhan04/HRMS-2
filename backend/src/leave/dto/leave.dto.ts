import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from "class-validator";

export class ApplyLeaveDto {
  @IsUUID()
  leaveTypeId: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class RejectLeaveDto {
  @IsString()
  reason: string;
}

export class CreateLeaveTypeDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(31)
  accrualPerMonth?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(365)
  carryForwardCap?: number;

  @IsOptional()
  @IsBoolean()
  requiresApprovalChain?: boolean;

  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;
}
