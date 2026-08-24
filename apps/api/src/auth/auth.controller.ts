import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards';
import { CurrentUser } from '../common/decorators';

class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}

class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}

class TelegramInitDto {
  @IsString()
  initData: string;
}

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

/** Muddati oʻtgan yozuvlarni tozalash — Map cheksiz oʻsmasin */
function sweepAttempts(now: number) {
  for (const [k, v] of loginAttempts) {
    if (v.resetAt < now) loginAttempts.delete(k);
  }
}

function checkRateLimit(key: string, max = 20, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  if (loginAttempts.size > 5000) sweepAttempts(now);
  const row = loginAttempts.get(key);
  if (!row || row.resetAt < now) {
    loginAttempts.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  row.count += 1;
  if (row.count > max) {
    throw new HttpException(
      'Juda koʻp urinish. 15 daqiqadan keyin qayta urinib koʻring.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'local';
    checkRateLimit(`${ip}:${dto.email.toLowerCase()}`);
    return this.auth.login(dto.email, dto.password);
  }

  @Post('telegram')
  telegramLogin(@Body() dto: TelegramInitDto, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'local';
    checkRateLimit(`${ip}:tg`, 40);
    return this.auth.loginWithTelegram(dto.initData);
  }

  @Post('link-telegram')
  @UseGuards(JwtAuthGuard)
  linkTelegram(@CurrentUser('id') userId: string, @Body() dto: TelegramInitDto) {
    return this.auth.linkTelegram(userId, dto.initData);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser('id') userId: string) {
    return this.auth.me(userId);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  changePassword(@CurrentUser('id') userId: string, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(userId, dto.currentPassword, dto.newPassword);
  }
}
