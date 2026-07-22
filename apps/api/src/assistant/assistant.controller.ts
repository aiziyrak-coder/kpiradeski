import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { IsArray, IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Role } from '@prisma/client';
import { AssistantService } from './assistant.service';
import { JwtAuthGuard, Roles, RolesGuard } from '../common/guards';
import { CurrentUser } from '../common/decorators';

class HistItem {
  @IsString() role: string;
  @IsString() content: string;
}

class ChatDto {
  @IsString() message: string;
  @IsOptional() @IsBoolean() wantAudio?: boolean;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HistItem)
  history?: HistItem[];
}

@Controller('assistant')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
export class AssistantController {
  constructor(private assistant: AssistantService) {}

  @Get('suggestions')
  suggestions(@CurrentUser() user: { id: string; role: Role; name?: string }) {
    return this.assistant.suggestions(user);
  }

  @Get('context')
  context(@CurrentUser() user: { id: string; role: Role; name?: string }) {
    return this.assistant.buildContext(user);
  }

  @Post('chat')
  chat(
    @CurrentUser() user: { id: string; role: Role; name?: string },
    @Body() dto: ChatDto,
  ) {
    if (!dto.message?.trim()) throw new BadRequestException('message kerak');
    return this.assistant.chat(user, dto.message.trim(), {
      wantAudio: dto.wantAudio ?? user.role !== Role.MANAGER,
      history: dto.history,
    });
  }

  @Post('voice')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 12 * 1024 * 1024 },
    }),
  )
  async voice(
    @CurrentUser() user: { id: string; role: Role; name?: string },
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('history') historyRaw?: string,
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('audio kerak');
    let history: Array<{ role: string; content: string }> | undefined;
    if (historyRaw) {
      try {
        history = JSON.parse(historyRaw);
      } catch {
        history = undefined;
      }
    }
    return this.assistant.voice(user, file.buffer, file.originalname || 'audio.webm', {
      history,
    });
  }
}
