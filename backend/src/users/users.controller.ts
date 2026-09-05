import { Body, Controller, Get, Patch } from "@nestjs/common";
import {
  CurrentUser,
  AuthenticatedUser,
} from "../common/decorators/current-user.decorator";
import { UsersService } from "./users.service";
import { IsDateString, IsEmail, IsOptional, IsString } from "class-validator";

class UpdateMyProfileDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() personalEmail?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
}

@Controller("users")
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findMe(user.userId);
  }

  @Patch("me/profile")
  updateMyProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateMyProfileDto,
  ) {
    return this.usersService.updateMyProfile(user.userId, dto);
  }
}
