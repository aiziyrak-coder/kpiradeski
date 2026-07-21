import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CallType, ReviewQuality, ReviewSource, Role } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { KpiService } from './kpi.service';
import { JwtAuthGuard, Roles, RolesGuard } from '../common/guards';
import { CurrentUser } from '../common/decorators';

class ChecklistDto {
  @IsString() date: string;
  @IsObject() items: Record<string, boolean>;
  @IsOptional() @IsBoolean() minStockFlag?: boolean;
}

class CallDto {
  @IsString() date: string;
  @IsEnum(CallType) type: CallType;
  @IsInt() @Min(0) callsCount: number;
  @IsInt() @Min(0) bookedCount: number;
  @IsOptional() @IsInt() @Min(0) recalledCount?: number;
}

class ReviewDto {
  @IsString() date: string;
  @IsInt() @Min(1) count: number;
  @IsEnum(ReviewSource) source: ReviewSource;
  @IsEnum(ReviewQuality) quality: ReviewQuality;
  @IsOptional() @IsString() note?: string;
}

class SeoDto {
  @IsString() date: string;
  @IsOptional() @IsBoolean() newArticle?: boolean;
  @IsOptional() @IsBoolean() newVideo?: boolean;
  @IsOptional() @IsBoolean() newReviews?: boolean;
  @IsOptional() @IsBoolean() pageUpdated?: boolean;
  @IsOptional() @IsBoolean() seoOk?: boolean;
  @IsOptional() @IsNumber() @Min(0) @Max(100) pagespeedScore?: number;
  @IsOptional() @IsString() note?: string;
}

class SocialDto {
  @IsString() date: string;
  @IsOptional() @IsInt() @Min(0) posts?: number;
  @IsOptional() @IsInt() @Min(0) stories?: number;
  @IsOptional() @IsInt() @Min(0) reels?: number;
  @IsOptional() @IsInt() @Min(0) comments?: number;
  @IsOptional() @IsInt() @Min(0) likes?: number;
  @IsOptional() @IsInt() @Min(0) newFollowers?: number;
  @IsOptional() @IsInt() @Min(0) views?: number;
}

class AdsDto {
  @IsString() date: string;
  @IsBoolean() aired: boolean;
  @IsOptional() @IsString() channel?: string;
  @IsOptional() @IsString() timeSlot?: string;
  @IsOptional() @IsString() note?: string;
}

class FlyerDto {
  @IsString() date: string;
  @IsInt() @Min(1) count: number;
  @IsString() location: string;
}

class BloggerDto {
  @IsString() weekStart: string;
  @IsString() name: string;
  @IsInt() @Min(0) followers: number;
  @IsOptional() @IsString() niche?: string;
  @IsOptional() @IsString() contact?: string;
  @IsOptional() @IsString() note?: string;
}

class StoryItem {
  @IsString() doctorId: string;
  @IsBoolean() posted: boolean;
}

class StoriesDto {
  @IsString() date: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => StoryItem)
  entries: StoryItem[];
}

class ReferralItem {
  @IsString() doctorId: string;
  @IsInt() @Min(0) patientsCount: number;
}

class ReferralsDto {
  @IsString() weekStart: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ReferralItem)
  entries: ReferralItem[];
}

class MysteryDto {
  @IsString() date: string;
  @IsBoolean() booked: boolean;
  @IsOptional() @IsString() note?: string;
}

@Controller('kpi')
@UseGuards(JwtAuthGuard, RolesGuard)
export class KpiController {
  constructor(private kpi: KpiService) {}

  @Get('meta')
  meta() {
    return this.kpi.meta();
  }

  @Get('day')
  day(@Query('date') date?: string) {
    return this.kpi.getDayOverview(date);
  }

  @Post('clinic')
  @Roles(Role.ADMIN, Role.MANAGER, Role.SUPER_ADMIN)
  clinic(@CurrentUser('id') userId: string, @Body() dto: ChecklistDto) {
    return this.kpi.saveClinic(userId, dto.date, dto.items);
  }

  @Post('reception')
  @Roles(Role.ADMIN, Role.MANAGER, Role.SUPER_ADMIN)
  reception(@CurrentUser('id') userId: string, @Body() dto: ChecklistDto) {
    return this.kpi.saveReception(userId, dto.date, dto.items);
  }

  @Post('uniform')
  @Roles(Role.ADMIN, Role.MANAGER, Role.SUPER_ADMIN)
  uniform(@CurrentUser('id') userId: string, @Body() dto: ChecklistDto) {
    return this.kpi.saveUniform(userId, dto.date, dto.items);
  }

  @Post('warehouse')
  @Roles(Role.ADMIN, Role.MANAGER, Role.SUPER_ADMIN)
  warehouse(@CurrentUser('id') userId: string, @Body() dto: ChecklistDto) {
    return this.kpi.saveWarehouse(userId, dto.date, dto.items, dto.minStockFlag);
  }

  @Post('calls')
  @Roles(Role.ADMIN, Role.MANAGER, Role.SUPER_ADMIN)
  calls(@CurrentUser('id') userId: string, @Body() dto: CallDto) {
    if (dto.type !== CallType.MISSED && dto.bookedCount > dto.callsCount) {
      throw new BadRequestException(
        "Yozilganlar soni qo'ng'iroqlardan ko'p bo'lishi mumkin emas",
      );
    }
    if (
      dto.type === CallType.MISSED &&
      dto.recalledCount != null &&
      dto.bookedCount > dto.recalledCount
    ) {
      throw new BadRequestException(
        "Yozilganlar qayta qo'ng'iroqlardan ko'p bo'lishi mumkin emas",
      );
    }
    return this.kpi.saveCall(
      userId,
      dto.date,
      dto.type,
      dto.callsCount,
      dto.bookedCount,
      dto.recalledCount,
    );
  }

  @Post('reviews')
  @Roles(Role.ADMIN, Role.MANAGER, Role.SUPER_ADMIN)
  reviews(@CurrentUser('id') userId: string, @Body() dto: ReviewDto) {
    return this.kpi.addReview(userId, dto.date, dto.count, dto.source, dto.quality, dto.note);
  }

  @Post('seo')
  @Roles(Role.MANAGER, Role.SUPER_ADMIN)
  seo(@CurrentUser('id') userId: string, @Body() dto: SeoDto) {
    const { date, ...rest } = dto;
    return this.kpi.saveSeo(userId, date, rest);
  }

  @Post('social/:platform')
  @Roles(Role.MANAGER, Role.SUPER_ADMIN)
  social(
    @CurrentUser('id') userId: string,
    @Param('platform') platform: string,
    @Body() dto: SocialDto,
  ) {
    const { date, ...rest } = dto;
    return this.kpi.saveSocial(date, platform, rest, userId);
  }

  @Post('ads')
  @Roles(Role.MANAGER, Role.SUPER_ADMIN)
  ads(@CurrentUser('id') userId: string, @Body() dto: AdsDto) {
    const { date, ...rest } = dto;
    return this.kpi.saveAds(userId, date, rest);
  }

  @Post('flyers')
  @Roles(Role.MANAGER, Role.SUPER_ADMIN)
  flyers(@CurrentUser('id') userId: string, @Body() dto: FlyerDto) {
    return this.kpi.addFlyer(userId, dto.date, dto.count, dto.location);
  }

  @Post('bloggers')
  @Roles(Role.MANAGER, Role.SUPER_ADMIN)
  bloggers(@CurrentUser('id') userId: string, @Body() dto: BloggerDto) {
    const { weekStart, ...rest } = dto;
    return this.kpi.addBlogger(userId, weekStart, rest);
  }

  @Get('bloggers')
  @Roles(Role.MANAGER, Role.DIRECTOR, Role.SUPER_ADMIN)
  listBloggers() {
    return this.kpi.listBloggers();
  }

  @Post('doctor-stories')
  @Roles(Role.ADMIN, Role.MANAGER, Role.SUPER_ADMIN)
  stories(@CurrentUser('id') userId: string, @Body() dto: StoriesDto) {
    return this.kpi.saveDoctorStories(userId, dto.date, dto.entries);
  }

  @Get('doctor-referrals')
  @Roles(Role.ADMIN, Role.MANAGER, Role.DIRECTOR, Role.SUPER_ADMIN)
  listReferrals(@Query('weekStart') weekStart?: string) {
    return this.kpi.listDoctorReferrals(weekStart);
  }

  @Post('doctor-referrals')
  @Roles(Role.MANAGER, Role.SUPER_ADMIN)
  referrals(@CurrentUser('id') userId: string, @Body() dto: ReferralsDto) {
    return this.kpi.saveDoctorReferrals(userId, dto.weekStart, dto.entries);
  }

  @Post('mystery')
  @Roles(Role.MANAGER, Role.SUPER_ADMIN)
  mystery(@CurrentUser('id') userId: string, @Body() dto: MysteryDto) {
    return this.kpi.saveMystery(userId, dto.date, dto.booked, dto.note);
  }

  @Get('mystery')
  @Roles(Role.MANAGER, Role.DIRECTOR, Role.SUPER_ADMIN)
  listMystery() {
    return this.kpi.listMystery();
  }

  @Post('ai-reports/:type')
  @Roles(Role.MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  aiReport(
    @Param('type') type: string,
    @Query('weekStart') weekStart?: string,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('branchId') branchId?: string,
  ) {
    const t = String(type).toUpperCase();
    if (!['SERVICES', 'CALLS', 'KPI'].includes(t)) {
      throw new BadRequestException('type: KPI | CALLS | SERVICES');
    }
    return this.kpi.generateAiReport(t as any, { period, from, to, weekStart, branchId });
  }

  @Get('ai-reports')
  @Roles(Role.MANAGER, Role.ADMIN, Role.DIRECTOR, Role.SUPER_ADMIN)
  listAi() {
    return this.kpi.listAiReports();
  }

  @Get('ai-status')
  @Roles(Role.MANAGER, Role.ADMIN, Role.DIRECTOR, Role.SUPER_ADMIN)
  aiStatus() {
    const configured = Boolean(process.env.OPENAI_API_KEY?.trim());
    return {
      configured,
      model: process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini',
      mode: configured ? 'openai' : 'template',
    };
  }
}
