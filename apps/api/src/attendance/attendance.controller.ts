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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Role } from '@prisma/client';
import { IsOptional, IsString } from 'class-validator';
import { Response } from 'express';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard, Roles, RolesGuard } from '../common/guards';
import { CurrentUser } from '../common/decorators';

class CreateEmpDto {
  @IsString() branchId: string;
  @IsString() firstName: string;
  @IsString() lastName: string;
  @IsString() expectedArrive: string;
  @IsOptional() @IsString() expectedLeave?: string;
  @IsOptional() @IsString() position?: string;
  @IsOptional() @IsString() workDays?: string;
  @IsOptional() @IsString() satArrive?: string;
  @IsOptional() @IsString() satLeave?: string;
}

class UpdateEmpDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() expectedArrive?: string;
  @IsOptional() @IsString() expectedLeave?: string;
  @IsOptional() @IsString() position?: string;
  @IsOptional() @IsString() workDays?: string;
  @IsOptional() @IsString() satArrive?: string;
  @IsOptional() @IsString() satLeave?: string;
  @IsOptional() @IsString() active?: string;
}

@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
export class AttendanceController {
  constructor(private attendance: AttendanceService) {}

  @Get('employees')
  list(
    @CurrentUser() user: { id: string; role: Role },
    @Query('branchId') branchId?: string,
  ) {
    return this.attendance.listEmployees(user, branchId);
  }

  @Post('employees')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @UseInterceptors(
    FileInterceptor('photo', { storage: memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } }),
  )
  create(
    @CurrentUser() user: { id: string; role: Role },
    @Body() dto: CreateEmpDto,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    return this.attendance.createEmployee(user, {
      branchId: dto.branchId,
      firstName: dto.firstName,
      lastName: dto.lastName,
      expectedArrive: dto.expectedArrive,
      expectedLeave: dto.expectedLeave,
      position: dto.position,
      workDays: dto.workDays,
      satArrive: dto.satArrive,
      satLeave: dto.satLeave,
      file: photo,
    });
  }

  @Patch('employees/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @UseInterceptors(
    FileInterceptor('photo', { storage: memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } }),
  )
  update(
    @CurrentUser() user: { id: string; role: Role },
    @Param('id') id: string,
    @Body() dto: UpdateEmpDto,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    const active =
      dto.active === undefined || dto.active === ''
        ? undefined
        : dto.active === 'true' || dto.active === '1';
    return this.attendance.updateEmployee(user, id, {
      firstName: dto.firstName,
      lastName: dto.lastName,
      expectedArrive: dto.expectedArrive,
      expectedLeave: dto.expectedLeave,
      position: dto.position,
      workDays: dto.workDays,
      satArrive: dto.satArrive,
      satLeave: dto.satLeave,
      active,
      file: photo,
    });
  }

  @Get('employees/:id/photo')
  async photo(
    @CurrentUser() user: { id: string; role: Role },
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const full = await this.attendance.photoPath(user, id);
    res.setHeader('Cache-Control', 'private, max-age=120');
    res.sendFile(full);
  }

  @Get('day')
  day(
    @CurrentUser() user: { id: string; role: Role },
    @Query('branchId') branchId: string,
    @Query('date') date?: string,
  ) {
    if (!branchId) throw new BadRequestException('branchId kerak');
    return this.attendance.dayBoard(user, branchId, date);
  }

  @Post('scan')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'live', maxCount: 1 },
        { name: 'live2', maxCount: 1 },
      ],
      { storage: memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } },
    ),
  )
  scan(
    @CurrentUser() user: { id: string; role: Role },
    @UploadedFiles()
    files: { live?: Express.Multer.File[]; live2?: Express.Multer.File[] },
    @Body() body: { employeeId?: string; branchId?: string; date?: string },
  ) {
    if (!body.employeeId || !body.branchId) {
      throw new BadRequestException('employeeId va branchId kerak');
    }
    return this.attendance.scan(user, {
      employeeId: body.employeeId,
      branchId: body.branchId,
      date: body.date,
      live: files?.live?.[0],
      live2: files?.live2?.[0],
    });
  }
}
