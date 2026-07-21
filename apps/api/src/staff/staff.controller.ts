import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Role } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Response } from 'express';
import { StaffService } from './staff.service';
import { JwtAuthGuard, Roles, RolesGuard } from '../common/guards';
import { CurrentUser } from '../common/decorators';

class ProfileDto {
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() bio?: string;
  @IsOptional() @IsString() avatarUrl?: string;
}

class SubmitDto {
  @IsOptional() @IsString() employeeNote?: string;
}

class ReviewDto {
  @IsEnum(['APPROVED', 'REJECTED'] as any) status: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() reviewerNote?: string;
}

class UpdateTaskDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() proofRequired?: boolean;
  @IsOptional() @IsNumber() weight?: number;
}

class AssignDailyTaskDto {
  @IsString() userId: string;
  @IsString() positionId: string;
  @IsString() title: string;
  @IsString() description: string;
  @IsOptional() @IsBoolean() proofRequired?: boolean;
  @IsOptional() @IsNumber() weight?: number;
  @IsOptional() @IsBoolean() recurring?: boolean;
}

class SetPositionDto {
  @IsString() positionId: string;
}

class TemplateDto {
  @IsOptional() @IsString() id?: string;
  @IsString() positionId: string;
  @IsString() title: string;
  @IsString() description: string;
  @IsOptional() @IsBoolean() proofRequired?: boolean;
  @IsOptional() @IsNumber() weight?: number;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

class MonthDto {
  @IsInt() @Min(2024) @Max(2100) year: number;
  @IsInt() @Min(1) @Max(12) month: number;
}

@Controller('staff')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StaffController {
  constructor(private staff: StaffService) {}

  @Get('automation')
  @Roles(Role.MANAGER, Role.DIRECTOR, Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  automation() {
    return this.staff.automationStatus();
  }

  @Post('automation/spawn')
  @Roles(Role.MANAGER, Role.DIRECTOR, Role.SUPER_ADMIN, Role.ADMIN)
  spawnNow() {
    return this.staff.spawnAllToday('manual-api');
  }

  @Get('meta')
  meta() {
    return { positions: this.staff.positionLabels() };
  }

  @Get('me')
  me(@CurrentUser('id') userId: string) {
    return this.staff.getMyProfile(userId);
  }

  @Patch('me')
  updateMe(@CurrentUser('id') userId: string, @Body() dto: ProfileDto) {
    return this.staff.updateMyProfile(userId, dto);
  }

  @Get('my-tasks')
  @Roles(Role.STAFF, Role.ADMIN)
  myTasks(@CurrentUser('id') userId: string, @Query('date') date?: string) {
    return this.staff.listMyTasks(userId, date);
  }

  @Post('tasks/:id/submit')
  @Roles(Role.STAFF, Role.ADMIN)
  submit(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: SubmitDto,
  ) {
    return this.staff.submitTask(userId, id, dto.employeeNote);
  }

  @Post('tasks/:id/proof')
  @Roles(Role.STAFF, Role.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  async proof(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Fayl yuklanmadi');
    return this.staff.saveProof(userId, id, {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      buffer: file.buffer,
    });
  }

  @Get('proofs/:id')
  @UseGuards(JwtAuthGuard)
  async getProof(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { proof, full } = await this.staff.getProofForUser(id, userId);
    res.setHeader('Content-Type', proof.mimeType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(full);
  }

  @Get('team')
  @Roles(Role.MANAGER, Role.DIRECTOR, Role.SUPER_ADMIN, Role.ADMIN)
  team(@Query('date') date?: string) {
    return this.staff.teamBoard(date);
  }

  @Post('tasks/:id/review')
  @Roles(Role.MANAGER, Role.DIRECTOR, Role.SUPER_ADMIN, Role.ADMIN)
  review(
    @CurrentUser('id') reviewerId: string,
    @Param('id') id: string,
    @Body() dto: ReviewDto,
  ) {
    return this.staff.reviewTask(reviewerId, id, dto.status, dto.reviewerNote);
  }

  @Patch('tasks/:id')
  @Roles(Role.MANAGER, Role.DIRECTOR, Role.SUPER_ADMIN, Role.ADMIN)
  updateTask(
    @CurrentUser('id') managerId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.staff.updateTask(managerId, id, dto);
  }

  @Post('tasks/:id/delete')
  @Roles(Role.MANAGER, Role.DIRECTOR, Role.SUPER_ADMIN, Role.ADMIN)
  deleteTask(@CurrentUser('id') managerId: string, @Param('id') id: string) {
    return this.staff.deleteTask(managerId, id);
  }

  @Post('assign')
  @Roles(Role.MANAGER, Role.DIRECTOR, Role.SUPER_ADMIN, Role.ADMIN)
  assign(@CurrentUser('id') managerId: string, @Body() dto: AssignDailyTaskDto) {
    return this.staff.assignDailyTask(managerId, dto);
  }

  @Post('ai-daily')
  @Roles(Role.MANAGER, Role.DIRECTOR, Role.SUPER_ADMIN, Role.ADMIN)
  aiDaily() {
    return this.staff.runAiDailyMonitor('manual-api');
  }

  @Patch('users/:id/position')
  @Roles(Role.MANAGER, Role.DIRECTOR, Role.SUPER_ADMIN, Role.ADMIN)
  setPosition(
    @CurrentUser('id') managerId: string,
    @Param('id') id: string,
    @Body() dto: SetPositionDto,
  ) {
    return this.staff.setStaffPosition(managerId, id, dto.positionId);
  }

  @Get('templates')
  @Roles(Role.MANAGER, Role.DIRECTOR, Role.SUPER_ADMIN, Role.ADMIN)
  templates(@Query('positionId') positionId?: string, @Query('userId') userId?: string) {
    return this.staff.listTemplates({ positionId, userId });
  }

  @Post('templates')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER, Role.ADMIN, Role.DIRECTOR)
  saveTemplate(@Body() dto: TemplateDto) {
    return this.staff.upsertTemplate(dto);
  }

  @Post('templates/:id/delete')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER, Role.ADMIN, Role.DIRECTOR)
  deleteTemplate(@CurrentUser('id') managerId: string, @Param('id') id: string) {
    return this.staff.deleteTemplate(managerId, id);
  }

  @Get('users')
  @Roles(Role.MANAGER, Role.DIRECTOR, Role.SUPER_ADMIN, Role.ADMIN)
  users() {
    return this.staff.listStaffUsers();
  }

  @Post('monthly/evaluate')
  @Roles(Role.MANAGER, Role.SUPER_ADMIN)
  evaluate(@Body() dto: MonthDto) {
    return this.staff.evaluateMonth(dto.year, dto.month);
  }

  @Get('monthly')
  @Roles(Role.MANAGER, Role.DIRECTOR, Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  async monthly(
    @Query('year') year: string,
    @Query('month') month: string,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    const data = await this.staff.getMonthReport(Number(year), Number(month));
    if (user.role === Role.STAFF) {
      return {
        year: data.year,
        month: data.month,
        scores: data.scores.filter((s) => s.userId === user.id),
        leadershipReport: null,
      };
    }
    return data;
  }
}
