import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CalcomService } from './calcom.service';
import {
  CalcomConfigResponseDto,
  UpdateCalcomConfigDto,
} from './dto/calcom-config.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../common/entities/user.entity';

@Controller('calcom')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CalcomController {
  constructor(private readonly calcomService: CalcomService) {}

  @Get('config')
  @Roles(UserRole.ADMIN)
  getConfig(): Promise<CalcomConfigResponseDto> {
    return this.calcomService.getConfig();
  }

  @Put('config')
  @Roles(UserRole.ADMIN)
  updateConfig(
    @Body() dto: UpdateCalcomConfigDto,
  ): Promise<CalcomConfigResponseDto> {
    return this.calcomService.updateConfig(dto);
  }

  @Post('test')
  @Roles(UserRole.ADMIN)
  testConnection(): Promise<{ success: boolean; message: string }> {
    return this.calcomService.testConnection();
  }
}
