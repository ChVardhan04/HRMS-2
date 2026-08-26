import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import { SaturdayWorkPattern } from "@prisma/client";

export class HolidayDto {
  @IsString()
  name: string;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsBoolean()
  isOptional?: boolean;
}

export class CalendarSettingsDto {
  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  officeStartMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  officeEndMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  lunchStartMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  lunchEndMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  lateGraceMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  attendanceCallStartMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  attendanceCallEndMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  attendanceAbsenceCutoffMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  dprSlaMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  dprReminder1Minutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  dprReminder2Minutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  kraStrikeThresholdScore?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  kraRollingWindowMonths?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  kraStrikesToEscalate?: number;

  @IsOptional()
  @IsEnum(SaturdayWorkPattern)
  saturdayWorkPattern?: SaturdayWorkPattern;
}
