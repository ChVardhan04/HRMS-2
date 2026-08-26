import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { AuthService } from "./auth.service";
import { Public } from "../common/decorators/public.decorator";
import {
  CurrentUser,
  AuthenticatedUser,
} from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import {
  ActivateAccountDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshTokenDto,
  ResetPasswordDto,
  ResendActivationDto,
} from "./dto/auth.dto";

@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post("login")
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(
      dto.email,
      dto.password,
      req.ip,
      req.headers["user-agent"],
    );
  }

  @Public()
  @Post("refresh")
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post("logout")
  logout(@CurrentUser() user: AuthenticatedUser, @Body() dto: RefreshTokenDto) {
    return this.authService.logout(user.userId, dto.refreshToken);
  }

  @Public()
  @Post("activate")
  activate(@Body() dto: ActivateAccountDto) {
    return this.authService.activateAccount(dto.token, dto.newPassword);
  }

  @Public()
  @Post("resend-activation")
  resendActivation(@Body() dto: ResendActivationDto) {
    return this.authService.resendActivation(dto.email);
  }

  @Public()
  @Post("forgot-password")
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Public()
  @Post("reset-password")
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Post("change-password")
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(
      user.userId,
      dto.currentPassword,
      dto.newPassword,
    );
  }
}
