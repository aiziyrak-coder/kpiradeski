import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';
import { PositionsService } from './positions.service';
import { JwtAuthGuard, Roles, RolesGuard } from '../common/guards';

class PositionDto {
  @IsOptional() @IsString() code?: string;
  @IsString() nameUz: string;
  @IsString() nameRu: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

@Controller('positions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PositionsController {
  constructor(private positions: PositionsService) {}

  @Get()
  @Roles(Role.MANAGER, Role.DIRECTOR, Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  list(@Query('active') active?: string) {
    return this.positions.list(active === 'true');
  }

  @Get(':id')
  @Roles(Role.MANAGER, Role.DIRECTOR, Role.SUPER_ADMIN, Role.ADMIN)
  one(@Param('id') id: string) {
    return this.positions.get(id);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.MANAGER)
  create(@Body() dto: PositionDto) {
    return this.positions.create(dto);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER)
  update(@Param('id') id: string, @Body() dto: PositionDto) {
    return this.positions.update(id, dto);
  }

  @Post(':id/delete')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER)
  remove(@Param('id') id: string) {
    return this.positions.remove(id);
  }
}
