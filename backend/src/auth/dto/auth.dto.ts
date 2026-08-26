import { IsEmail, IsString, MinLength } from "class-validator";

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

export class RefreshTokenDto {
  @IsString()
  refreshToken: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(12)
  newPassword: string;
}

export class ActivateAccountDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(12)
  newPassword: string;
}

export class ResendActivationDto {
  @IsEmail()
  email: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(12)
  newPassword: string;
}
