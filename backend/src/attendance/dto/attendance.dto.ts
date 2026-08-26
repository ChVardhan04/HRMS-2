import { IsLatitude, IsLongitude, IsOptional, IsString } from "class-validator";

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
