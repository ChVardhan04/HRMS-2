import { IsEnum, IsLatitude, IsLongitude, IsOptional, IsString } from "class-validator";
import { PortalActivityReviewStatus } from "@prisma/client";

export class CheckInDto {
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CheckOutDto {
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class RegularisationRequestDto {
  @IsString()
  workDayId: string;

  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  requestedCheckIn?: string;

  @IsOptional()
  @IsString()
  requestedCheckOut?: string;
}

export class PortalHeartbeatDto {
  @IsString()
  sessionId: string;

  @IsOptional()
  @IsString()
  clientTime?: string;
}


export class PortalActivityReviewDto {
  @IsEnum(PortalActivityReviewStatus)
  status: PortalActivityReviewStatus;

  @IsOptional()
  @IsString()
  note?: string;
}
