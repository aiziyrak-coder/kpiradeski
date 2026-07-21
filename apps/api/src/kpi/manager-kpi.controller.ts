import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { KpiFrequency, Role } from '@prisma/client';
import { Allow, IsBoolean, IsOptional, IsString } from 'class-validator';
import { Response } from 'express';
import { ManagerKpiService } from './manager-kpi.service';
import { JwtAuthGuard, Roles, RolesGuard } from '../common/guards';
import { CurrentUser } from '../common/decorators';

class EntryDto {
  @IsString() branchId: string;
  @IsOptional() @IsString() date?: string;
  @IsString() nodeKey: string;
  @IsOptional() @Allow() value?: any;
  @IsOptional() @IsBoolean() done?: boolean;
}

@Controller('manager-kpi')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
export class ManagerKpiController {
  constructor(private kpi: ManagerKpiService) {}

  @Get('catalog')
  catalog(@Query('lang') lang?: string, @Query('frequency') frequency?: string) {
    const freq = ['DAILY', 'WEEKLY', 'MONTHLY'].includes(String(frequency).toUpperCase())
      ? (String(frequency).toUpperCase() as KpiFrequency)
      : undefined;
    return this.kpi.catalog(lang === 'ru' ? 'ru' : 'uz', freq);
  }

  @Get('day')
  day(
    @CurrentUser() user: { id: string; role: Role },
    @Query('branchId') branchId: string,
    @Query('date') date?: string,
    @Query('frequency') frequency?: string,
  ) {
    if (!branchId) throw new BadRequestException('branchId kerak');
    const freq = ['DAILY', 'WEEKLY', 'MONTHLY'].includes(
      String(frequency || 'DAILY').toUpperCase(),
    )
      ? (String(frequency || 'DAILY').toUpperCase() as KpiFrequency)
      : KpiFrequency.DAILY;
    return this.kpi.getDay(user, branchId, date, freq);
  }

  @Post('entry')
  entry(@CurrentUser() user: { id: string; role: Role }, @Body() dto: EntryDto) {
    return this.kpi.saveEntry(user, dto);
  }

  @Post('proof')
  @Roles(Role.MANAGER)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  async proof(
    @CurrentUser() user: { id: string; role: Role },
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('branchId') branchId: string,
    @Body('nodeKey') nodeKey: string,
    @Body('date') date?: string,
  ) {
    if (!file) throw new BadRequestException('Fayl yuklanmadi');
    if (!branchId || !nodeKey) throw new BadRequestException('branchId va nodeKey kerak');
    return this.kpi.saveProof(user, {
      branchId,
      nodeKey,
      date,
      file: {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        buffer: file.buffer,
      },
    });
  }

  @Get('proofs/:id')
  async getProof(
    @CurrentUser() user: { id: string; role: Role },
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { proof, full } = await this.kpi.getProofFile(id, user);
    res.setHeader('Content-Type', proof.mimeType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(full);
  }
}
