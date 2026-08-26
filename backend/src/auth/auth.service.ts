import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MIN = 15;
const DEFAULT_ACTIVATION_TTL_HOURS = 24;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private notifications: NotificationsService,
  ) {}

  private hashToken(token: string) {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  private async issueTokens(
    userId: string,
    email: string,
    employeeId: string | undefined,
    roles: string[],
  ) {
    const payload = { sub: userId, email, employeeId, roles };

    const accessToken = this.jwt.sign(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: process.env.JWT_ACCESS_TTL ?? "15m",
    });
    const refreshToken = this.jwt.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: process.env.JWT_REFRESH_TTL ?? "7d",
    });

    const ttlDays = 7;
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
      },
    });

    return { accessToken, refreshToken };
  }

  private async loadUserWithRoles(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } }, employee: true },
    });
  }

  async login(
    email: string,
    password: string,
    ip?: string,
    userAgent?: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { roles: { include: { role: true } }, employee: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException("Invalid credentials");
    }

    if (user.mustChangePassword) {
      throw new ForbiddenException(
        "Account is not activated. Please use the activation link sent to your work email.",
      );
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenException(
        "Account temporarily locked due to failed login attempts",
      );
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const failedCount = user.failedLoginCount + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: failedCount,
          lockedUntil:
            failedCount >= MAX_FAILED_LOGIN_ATTEMPTS
              ? new Date(Date.now() + LOCK_DURATION_MIN * 60 * 1000)
              : null,
        },
      });
      throw new UnauthorizedException("Invalid credentials");
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const roles = user.roles.map((r) => r.role.name);
    const tokens = await this.issueTokens(
      user.id,
      user.email,
      user.employee?.id,
      roles,
    );

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        roles,
        employee: user.employee,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  async refresh(refreshToken: string) {
    let payload: any;
    try {
      payload = this.jwt.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { userId: payload.sub, tokenHash, revokedAt: null },
    });
    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException("Refresh token expired or revoked");
    }

    // Rotate atomically so two concurrent refresh requests cannot both reuse the same token.
    const rotated = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (rotated.count !== 1)
      throw new UnauthorizedException("Refresh token has already been used");

    const user = await this.loadUserWithRoles(payload.sub);
    if (!user || !user.isActive) throw new UnauthorizedException();

    const roles = user.roles.map((r) => r.role.name);
    return this.issueTokens(user.id, user.email, user.employee?.id, roles);
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      const tokenHash = this.hashToken(refreshToken);
      await this.prisma.refreshToken.updateMany({
        where: { userId, tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } else {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return { success: true };
  }

  private async createActivationToken(userId: string) {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = this.hashToken(rawToken);
    const ttlHours = Number(
      process.env.ACCOUNT_ACTIVATION_TTL_HOURS ?? DEFAULT_ACTIVATION_TTL_HOURS,
    );
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    await this.prisma.accountActivationToken.deleteMany({
      where: { userId, usedAt: null },
    });

    await this.prisma.accountActivationToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    return rawToken;
  }

  private activationUrl(rawToken: string) {
    const baseUrl = (
      process.env.APP_URL ??
      process.env.FRONTEND_URL ??
      "http://localhost:3000"
    ).replace(/\/$/, "");
    return `${baseUrl}/auth/activate?token=${encodeURIComponent(rawToken)}`;
  }

  async activateAccount(token: string, newPassword: string) {
    const tokenHash = this.hashToken(token);
    const activation = await this.prisma.accountActivationToken.findFirst({
      where: { tokenHash, usedAt: null },
      include: { user: true },
    });

    if (!activation || activation.expiresAt <= new Date()) {
      throw new BadRequestException(
        "This activation link is invalid or has expired.",
      );
    }

    const passwordHash = await AuthService.hashPassword(newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: activation.userId },
        data: {
          passwordHash,
          mustChangePassword: false,
          isActive: true,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      }),
      this.prisma.accountActivationToken.update({
        where: { id: activation.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { success: true, email: activation.user.email };
  }

  async resendActivation(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.mustChangePassword || !user.isActive) {
      return { success: true };
    }

    const rawToken = await this.createActivationToken(user.id);
    const url = this.activationUrl(rawToken);
    const ttlHours = Number(
      process.env.ACCOUNT_ACTIVATION_TTL_HOURS ?? DEFAULT_ACTIVATION_TTL_HOURS,
    );
    await this.notifications.sendEmail({
      to: user.email,
      subject: "Activate your HRMS account",
      body: `Your HRMS account is ready. Open this link within ${ttlHours} hours to set your password: ${url}`,
      html: `<p>Your HRMS account is ready.</p><p><a href="${url}">Activate your account</a></p><p>This link expires in ${ttlHours} hours.</p>`,
    });

    return { success: true };
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Do not leak whether the account exists.
    if (!user) return { success: true };

    const rawToken = crypto.randomBytes(32).toString("hex");
    const ttlMin = Number(process.env.PASSWORD_RESET_TTL_MIN ?? 30);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(rawToken),
        expiresAt: new Date(Date.now() + ttlMin * 60 * 1000),
      },
    });

    const baseUrl = (
      process.env.APP_URL ??
      process.env.FRONTEND_URL ??
      "http://localhost:3000"
    ).replace(/\/$/, "");
    const resetUrl = `${baseUrl}/auth/reset-password?token=${encodeURIComponent(rawToken)}`;

    await this.notifications.sendEmail({
      to: user.email,
      subject: "Reset your HRMS password",
      body: `Reset your HRMS password using this link (valid ${ttlMin} minutes): ${resetUrl}`,
      html: `<p>Reset your HRMS password.</p><p><a href="${resetUrl}">Reset password</a></p><p>This link expires in ${ttlMin} minutes.</p>`,
    });

    return { success: true };
  }

  async resetPassword(token: string, newPassword: string) {
    const tokenHash = this.hashToken(token);
    const resetToken = await this.prisma.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null },
    });
    if (!resetToken || resetToken.expiresAt < new Date()) {
      throw new BadRequestException("Invalid or expired reset token");
    }

    const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash, mustChangePassword: false },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { success: true };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestException("Current password is incorrect");

    const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    });

    return { success: true };
  }

  static async hashPassword(password: string) {
    const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);
    return bcrypt.hash(password, saltRounds);
  }
}
