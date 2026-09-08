import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
} from "class-validator";
import { GroupPlatform } from "@prisma/client";

export class CreateGroupDto {
  @IsString()
  name: string;

  @IsEnum(GroupPlatform)
  platform: GroupPlatform;

  @IsOptional()
  @IsUrl({ require_tld: false })
  inviteLink?: string;

  @IsOptional()
  @IsUUID()
  ownerId?: string;
}

export class AddGroupMemberDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsString()
  externalName?: string;
}

export class CheckGroupDto {
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  escalated?: boolean;

  @IsOptional()
  @IsString()
  escalationNote?: string;
}
