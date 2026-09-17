import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { MediaService } from './media.service';
import { CreateMediaAssetDto, UpdateMediaAssetDto } from './dto/media.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../common/entities/user.entity';

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  /**
   * Public list of media assets for web landings
   */
  @Get()
  async findAll(
    @Query('type') type?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.mediaService.findAll(type, activeOnly !== 'false');
  }

  /**
   * Streaming endpoint supporting HTTP 206 Range headers for video and audio playback
   */
  @Get('stream/:key')
  async stream(
    @Param('key') key: string,
    @Headers('range') range: string | undefined,
    @Res() res: Response,
  ) {
    return this.mediaService.streamMedia(key, range, res);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string) {
    return this.mediaService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SERVICE_MANAGER)
  async create(@Body() dto: CreateMediaAssetDto) {
    return this.mediaService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SERVICE_MANAGER)
  async update(@Param('id') id: string, @Body() dto: UpdateMediaAssetDto) {
    return this.mediaService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async remove(@Param('id') id: string) {
    await this.mediaService.remove(id);
    return { success: true };
  }
}
