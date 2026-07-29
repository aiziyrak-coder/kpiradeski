import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { BranchesService } from './branches.service';
import { JwtAuthGuard, Roles, RolesGuard } from '../common/guards';
import { CurrentUser } from '../common/decorators';

class BranchDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

class AssignDto {
  @IsString() userId: string;
}

@Controller('branches')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BranchesController {
  constructor(private branches: BranchesService) {}

  @Get('mine')
  @Roles(Role.MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  mine(@CurrentUser() user: { id: string; role: Role }) {
    return this.branches.mine(user.id, user.role);
  }

  @Get()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.MANAGER)
  list(@Query('active') active?: string, @CurrentUser() user?: { id: string; role: Role }) {
    if (user?.role === Role.MANAGER) {
      return this.branches.mine(user.id, user.role);
    }
    return this.branches.list(active === 'true');
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.MANAGER)
  one(@Param('id') id: string) {
    return this.branches.get(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  create(@Body() dto: BranchDto) {
    if (!dto.name?.trim()) throw new BadRequestException('Filial nomi kerak');
    return this.branches.create({
      name: dto.name.trim(),
      address: dto.address,
      active: dto.active,
    });
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  update(@Param('id') id: string, @Body() dto: BranchDto) {
    return this.branches.update(id, dto);
  }

  @Post(':id/managers')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  assign(@Param('id') id: string, @Body() dto: AssignDto) {
    return this.branches.assignManager(id, dto.userId);
  }

  @Delete(':id/managers/:userId')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  unassign(@Param('id') id: string, @Param('userId') userId: string) {
    return this.branches.unassignManager(id, userId);
  }
}
