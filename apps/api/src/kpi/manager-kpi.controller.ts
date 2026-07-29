import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { KpiFrequency, Role } from '@prisma/client';
import { Allow, IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
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

class BulkEntryDto {
  @IsString() branchId: string;
  @IsOptional() @IsString() date?: string;
  @Allow() nodeKeys: string[];
  @IsBoolean() done: boolean;
}

class AssignDto {
  @IsString() branchId: string;
  @IsOptional() @IsString() date?: string;
  @IsString() frequency: string;
  @IsArray() nodeKeys: string[];
}

class ReviewDto {
  @IsString() proofId: string;
  @IsBoolean() approve: boolean;
  @IsOptional() @IsString() note?: string;
}

class CreateCatalogTaskDto {
  @IsString() titleUz: string;
  @IsOptional() @IsString() titleRu?: string;
  @IsOptional() @IsString() descriptionUz?: string;
  @IsOptional() @IsString() descriptionRu?: string;
  @IsString() frequency: string;
  @IsString() parentKey: string;
  @IsOptional() @IsBoolean() proofRequired?: boolean;
  @IsOptional() @IsString() inputType?: string;
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

  @Get('catalog-parents')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  catalogParents(@Query('frequency') frequency?: string) {
    const freq = ['DAILY', 'WEEKLY', 'MONTHLY'].includes(
      String(frequency || 'DAILY').toUpperCase(),
    )
      ? (String(frequency || 'DAILY').toUpperCase() as KpiFrequency)
      : KpiFrequency.DAILY;
    return this.kpi.listCatalogParents(freq);
  }

  @Post('catalog-task')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  createCatalogTask(
    @CurrentUser() user: { id: string; role: Role },
    @Body() dto: CreateCatalogTaskDto,
  ) {
    const frequency = ['DAILY', 'WEEKLY', 'MONTHLY'].includes(
      String(dto.frequency || 'DAILY').toUpperCase(),
    )
      ? (String(dto.frequency || 'DAILY').toUpperCase() as KpiFrequency)
      : KpiFrequency.DAILY;
    return this.kpi.createCatalogTask(user, {
      titleUz: dto.titleUz,
      titleRu: dto.titleRu,
      descriptionUz: dto.descriptionUz,
      descriptionRu: dto.descriptionRu,
      frequency,
      parentKey: dto.parentKey,
      proofRequired: dto.proofRequired,
      inputType: dto.inputType,
    });
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
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  entry(@CurrentUser() user: { id: string; role: Role }, @Body() dto: EntryDto) {
    return this.kpi.saveEntry(user, dto);
  }

  @Post('entry-bulk')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  entryBulk(@CurrentUser() user: { id: string; role: Role }, @Body() dto: BulkEntryDto) {
    if (!Array.isArray(dto.nodeKeys) || !dto.nodeKeys.length) {
      throw new BadRequestException('nodeKeys kerak');
    }
    return this.kpi.saveEntryBulk(user, {
      branchId: dto.branchId,
      date: dto.date,
      nodeKeys: dto.nodeKeys,
      done: dto.done,
    });
  }

  @Post('assign')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  assign(@CurrentUser() user: { id: string; role: Role }, @Body() dto: AssignDto) {
    const frequency = ['DAILY', 'WEEKLY', 'MONTHLY'].includes(
      String(dto.frequency || 'DAILY').toUpperCase(),
    )
      ? (String(dto.frequency || 'DAILY').toUpperCase() as KpiFrequency)
      : KpiFrequency.DAILY;
    if (!Array.isArray(dto.nodeKeys)) throw new BadRequestException('nodeKeys kerak');
    return this.kpi.setAssignments(user, {
      branchId: dto.branchId,
      date: dto.date,
      frequency,
      nodeKeys: dto.nodeKeys,
    });
  }

  @Post('review-proof')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  review(@CurrentUser() user: { id: string; role: Role }, @Body() dto: ReviewDto) {
    return this.kpi.reviewProof(user, dto);
  }

  @Post('complete')
  @Roles(Role.MANAGER)
  complete(@CurrentUser() user: { id: string; role: Role }, @Body() dto: EntryDto) {
    return this.kpi.completeTask(user, {
      branchId: dto.branchId,
      date: dto.date,
      nodeKey: dto.nodeKey,
      value: dto.value,
    });
  }

  @Post('proof')
  @Roles(Role.MANAGER)
  @UseInterceptors(
    FilesInterceptor('files', 8, {
      storage: memoryStorage(),
      limits: { fileSize: 16 * 1024 * 1024 },
    }),
  )
  async proof(
    @CurrentUser() user: { id: string; role: Role },
    @UploadedFiles() uploaded: Express.Multer.File[] | undefined,
    @Body('branchId') branchId: string,
    @Body('nodeKey') nodeKey: string,
    @Body('date') date?: string,
    @Body('value') value?: string,
  ) {
    const list = uploaded || [];
    if (!list.length) throw new BadRequestException('Fayl yuklanmadi');
    if (!branchId || !nodeKey) throw new BadRequestException('branchId va nodeKey kerak');
    return this.kpi.saveProof(user, {
      branchId,
      nodeKey,
      date,
      value,
      files: list.map((file) => ({
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        buffer: file.buffer,
      })),
    });
  }

  @Get('proofs/:id')
  async getProof(
    @CurrentUser() user: { id: string; role: Role },
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { proof, full } = await this.kpi.getProofFile(id, user);
    const mime = proof.mimeType || 'application/octet-stream';
    const isImage = mime.startsWith('image/') && mime !== 'image/svg+xml';
    res.setHeader('Content-Type', isImage ? mime : 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=300');
    if (!isImage) {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(proof.fileName || 'proof')}"`,
      );
    }
    res.sendFile(full);
  }
}
