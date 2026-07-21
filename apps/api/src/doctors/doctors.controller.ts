import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { DoctorsService } from './doctors.service';
import { JwtAuthGuard, Roles, RolesGuard } from '../common/guards';

class CreateDoctorDto {
  @IsString() name: string;
  @IsOptional() @IsString() specialty?: string;
  @IsOptional() @IsString() branchId?: string;
}

class UpdateDoctorDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() specialty?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

@Controller('doctors')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DoctorsController {
  constructor(private doctors: DoctorsService) {}

  @Get()
  list() {
    return this.doctors.list();
  }

  @Get('ranking')
  ranking() {
    return this.doctors.ranking();
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.MANAGER)
  create(@Body() dto: CreateDoctorDto) {
    return this.doctors.create(dto);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateDoctorDto) {
    return this.doctors.update(id, dto);
  }
}
