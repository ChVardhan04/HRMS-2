import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from "class-validator";
import { LeaveDurationType } from "@prisma/client";

export class ApplyLeaveDto {
  @IsUUID()
  leaveTypeId: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsEnum(LeaveDurationType)
  durationType?: LeaveDurationType;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  emergencyContact?: string;

  @IsOptional()
  @IsString()
  emergencyAddress?: string;
}

export class LeavePreviewDto extends ApplyLeaveDto {}

export class RejectLeaveDto {
  @IsString()
  reason: string;
}

export class SetLeaveBalanceDto {
  @IsNumber()
  @Min(0)
  @Max(365)
  accrued: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(365)
  carriedForward?: number;
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
