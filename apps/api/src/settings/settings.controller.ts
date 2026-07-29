import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SettingsService } from './settings.service';
import { JwtAuthGuard, Roles, RolesGuard } from '../common/guards';

class WeightItem {
  @IsString() blockKey: string;
  @IsNumber() weight: number;
}

class WeightsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => WeightItem)
  items: WeightItem[];
}

class ProductDto {
  @IsString() name: string;
  @IsString() category: string;
  @IsInt() @Min(0) minStock: number;
  @IsInt() @Min(0) currentStock: number;
  @IsOptional() @IsString() expiryDate?: string;
  @IsOptional() @IsString() branchId?: string;
}

class UpdateProductDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsInt() @Min(0) minStock?: number;
  @IsOptional() @IsInt() @Min(0) currentStock?: number;
  @IsOptional() expiryDate?: string | null;
  @IsOptional() @IsString() branchId?: string;
}

class RestWeekdaysDto {
  @IsArray() @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true })
  days: number[];
}

class HolidayDto {
  @IsString() date: string;
  @IsString() title: string;
}

class WebsiteDto {
  @IsOptional() @IsString() id?: string;
  @IsString() name: string;
  @IsString() url: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

class ChannelDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() channelUrl?: string;
  @IsOptional() @IsString() botUsername?: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() profileUrl?: string;
  @IsOptional() @IsString() notes?: string;
}

class IntegrationsDto {
  @IsOptional() @ValidateNested() @Type(() => ChannelDto) telegram?: ChannelDto;
  @IsOptional() @ValidateNested() @Type(() => ChannelDto) instagram?: ChannelDto;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WebsiteDto)
  websites?: WebsiteDto[];
}

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(private settings: SettingsService) {}

  @Get('weights')
  getWeights() {
    return this.settings.getWeights();
  }

  @Put('weights')
  @Roles(Role.SUPER_ADMIN)
  updateWeights(@Body() dto: WeightsDto) {
    return this.settings.updateWeights(dto.items);
  }

  @Get('calendar')
  calendar() {
    return this.settings.getCalendar();
  }

  @Get('calendar/day')
  dayInfo(@Query('date') date?: string) {
    return this.settings.getDayInfo(date);
  }

  @Put('calendar/rest-weekdays')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER)
  setRestWeekdays(@Body() dto: RestWeekdaysDto) {
    return this.settings.setRestWeekdays(dto.days);
  }

  @Post('calendar/holidays')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER)
  addHoliday(@Body() dto: HolidayDto) {
    return this.settings.addHoliday(dto.date, dto.title);
  }

  @Delete('calendar/holidays/:id')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER)
  removeHoliday(@Param('id') id: string) {
    return this.settings.removeHoliday(id);
  }

  @Get('products')
  products() {
    return this.settings.listProducts();
  }

  @Get('products/low-stock')
  lowStock() {
    return this.settings.lowStock();
  }

  @Get('products/expiring')
  expiring(@Query('days') days?: string) {
    return this.settings.expiringSoon(days ? Number(days) : 30);
  }

  @Post('products')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER, Role.ADMIN)
  createProduct(@Body() dto: ProductDto) {
    return this.settings.createProduct(dto);
  }

  @Patch('products/:id')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER, Role.ADMIN)
  updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.settings.updateProduct(id, dto);
  }

  @Delete('products/:id')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER)
  deleteProduct(@Param('id') id: string) {
    return this.settings.deleteProduct(id);
  }

  @Get('integrations')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.DIRECTOR)
  getIntegrations() {
    return this.settings.getIntegrations();
  }

  @Put('integrations')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  updateIntegrations(@Body() dto: IntegrationsDto) {
    return this.settings.updateIntegrations(dto as any);
  }

  @Post('integrations/ai-audit')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  runIntegrationsAudit() {
    return this.settings.runIntegrationsAiAudit('manual');
  }

  @Get('integrations/ai-audit')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.DIRECTOR)
  async lastIntegrationsAudit() {
    const data = await this.settings.getIntegrations();
    return data.lastAudit;
  }
}
