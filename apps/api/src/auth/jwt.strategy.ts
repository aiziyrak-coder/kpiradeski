import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get('JWT_SECRET') || (() => { throw new Error('JWT_SECRET majburiy'); })(),
    });
  }

  async validate(payload: {
    sub: string;
    email: string;
    role: string;
    name: string;
    tv?: number;
  }) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.active) return null;
    if ((payload.tv ?? 0) !== user.tokenVersion) return null;
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      branchId: user.branchId,
    };
  }
}
