import * as crypto from 'crypto';
import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  private tokenPayload(user: {
    id: string;
    email: string;
    role: string;
    name: string;
    tokenVersion: number;
  }) {
    return {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      tv: user.tokenVersion,
    };
  }

  private publicUser(user: {
    id: string;
    name: string;
    email: string;
    role: any;
    position: any;
    branchId: string | null;
    telegramId?: string | null;
  }) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      position: user.position,
      branchId: user.branchId,
      telegramId: user.telegramId ?? null,
    };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.active) {
      throw new UnauthorizedException('Email yoki parol noto\'g\'ri');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Email yoki parol noto\'g\'ri');

    return {
      accessToken: this.jwt.sign(this.tokenPayload(user)),
      user: this.publicUser(user),
    };
  }

  /** Telegram Mini App initData orqali kirish (telegramId bogʻlangan boʻlsa) */
  async loginWithTelegram(initData: string) {
    const tgUser = this.validateTelegramInitData(initData);
    const user = await this.prisma.user.findUnique({
      where: { telegramId: String(tgUser.id) },
    });
    if (!user || !user.active) {
      throw new UnauthorizedException(
        'TELEGRAM_NOT_LINKED',
      );
    }
    return {
      accessToken: this.jwt.sign(this.tokenPayload(user)),
      user: this.publicUser(user),
      telegram: { id: tgUser.id, firstName: tgUser.first_name, username: tgUser.username },
    };
  }

  /** Kirgan foydalanuvchiga Telegram akkauntni bogʻlash */
  async linkTelegram(userId: string, initData: string) {
    const tgUser = this.validateTelegramInitData(initData);
    const tid = String(tgUser.id);
    const taken = await this.prisma.user.findFirst({
      where: { telegramId: tid, NOT: { id: userId } },
    });
    if (taken) {
      throw new BadRequestException('Bu Telegram akkaunt boshqa foydalanuvchiga bogʻlangan');
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { telegramId: tid },
    });
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'link_telegram',
        entity: 'user',
        entityId: userId,
        meta: { telegramId: tid, username: tgUser.username } as any,
      },
    });
    return this.publicUser(user);
  }

  validateTelegramInitData(initData: string): {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    language_code?: string;
  } {
    if (!initData?.trim()) throw new BadRequestException('initData yoʻq');
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) throw new BadRequestException('TELEGRAM_BOT_TOKEN sozlanmagan');

    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) throw new UnauthorizedException('Telegram imzo yoʻq');

    const entries: string[] = [];
    params.forEach((value, key) => {
      if (key !== 'hash') entries.push(`${key}=${value}`);
    });
    entries.sort();
    const dataCheckString = entries.join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculated = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    if (calculated !== hash) {
      throw new UnauthorizedException('Telegram imzo notoʻgʻri');
    }

    const authDate = Number(params.get('auth_date') || 0);
    const ageSec = Math.floor(Date.now() / 1000) - authDate;
    if (!authDate || ageSec > 86400) {
      throw new UnauthorizedException('Telegram sessiyasi eskirgan — Mini Appni qayta oching');
    }

    const userRaw = params.get('user');
    if (!userRaw) throw new UnauthorizedException('Telegram user yoʻq');
    try {
      return JSON.parse(userRaw);
    } catch {
      throw new UnauthorizedException('Telegram user yaroqsiz');
    }
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        position: true,
        phone: true,
        avatarUrl: true,
        bio: true,
        telegramId: true,
        branchId: true,
        active: true,
        branch: { select: { id: true, name: true } },
      },
    });
    if (!user) throw new UnauthorizedException();
    return user;
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('Yangi parol kamida 8 belgidan iborat bo\'lishi kerak');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new BadRequestException('Joriy parol noto\'g\'ri');
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    await this.prisma.auditLog.create({
      data: { userId, action: 'password_change', entity: 'user', entityId: userId },
    });
    return { ok: true };
  }
}
