import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsEnum,
  Max,
  Min,
} from "class-validator";
import { SaturdayWorkPattern } from "@prisma/client";

export class CreateDepartmentDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class UpdateDepartmentDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class CreateDesignationDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsUUID()
  departmentId: string;
}

export class DepartmentPolicyDto {
  @IsOptional() @IsBoolean() mondayWorking?: boolean;
  @IsOptional() @IsBoolean() tuesdayWorking?: boolean;
  @IsOptional() @IsBoolean() wednesdayWorking?: boolean;
  @IsOptional() @IsBoolean() thursdayWorking?: boolean;
  @IsOptional() @IsBoolean() fridayWorking?: boolean;
  @IsOptional() @IsBoolean() saturdayWorking?: boolean;
  @IsOptional() @IsEnum(SaturdayWorkPattern) saturdayWorkPattern?: SaturdayWorkPattern;
  @IsOptional() @IsBoolean() sundayWorking?: boolean;

  @IsOptional() @IsInt() @Min(0) @Max(1439) officeStartMinutes?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1439) officeEndMinutes?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1439) lunchStartMinutes?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1439) lunchEndMinutes?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1439) checkInOpenMinutes?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1439) lateAfterMinutes?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1439) halfDayAfterMinutes?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1439) checkInCutoffMinutes?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1439) autoAbsentMinutes?: number;

  @IsOptional() @IsInt() @Min(0) @Max(31) allowedLatesPerMonth?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(31) firstLatePenaltyDays?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(31) secondLatePenaltyDays?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(31) thirdPlusLatePenaltyDays?: number;

  @IsOptional() @IsBoolean() sandwichLeaveEnabled?: boolean;
  @IsOptional() @IsBoolean() sandwichIncludesPreviousWorkingDay?: boolean;
  @IsOptional() @IsNumber() @Min(0) @Max(31) probationMonthlyLeaveLimit?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(31) probationMaxDaysPerRequest?: number;
}

export class DepartmentLeavePolicyDto {
  @IsUUID()
  leaveTypeId: string;

  @IsNumber() @Min(0) @Max(365)
  annualEntitlement: number;

  @IsOptional() @IsNumber() @Min(0) @Max(31)
  monthlyEntitlement?: number;

  @IsBoolean()
  requiresBalance: boolean;

  @IsInt() @Min(0) @Max(60)
  advanceNoticeWorkingDays: number;

  @IsBoolean()
  allowPostApproval: boolean;

  @IsOptional() @IsNumber() @Min(0) @Max(31)
  medicalCertificateAfterDays?: number;

  @IsBoolean()
  sandwichApplies: boolean;

  @IsOptional() @IsNumber() @Min(0) @Max(365)
  maxConsecutiveDays?: number;

  @IsOptional() @IsBoolean()
  active?: boolean;
}
