import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as crypto from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { UserRole } from '../common/entities/user.entity';
import { WhatsappAdminSendService } from './whatsapp-admin-send.service';
import { RawUploadedFile } from './whatsapp-attachment-validator';

export interface WhatsappMultipartBody {
  agentKey?: string;
  to?: string;
  message?: string;
}

/**
 * Constant-time verification of the CLI token (`x-whatsapp-cli-token`) against
 * `process.env.WHATSAPP_CLI_TOKEN`.
 * - Fail-closed if `WHATSAPP_CLI_TOKEN` is undefined or empty.
 * - Fail-closed if `receivedToken` is missing or empty.
 * - Compares byte lengths before `crypto.timingSafeEqual` so differing lengths
 *   never throw `RangeError`.
 */
export function verifyWhatsappCliToken(
  receivedToken?: string | string[] | null,
  expectedToken: string | undefined = process.env.WHATSAPP_CLI_TOKEN,
): boolean {
  const expected = typeof expectedToken === 'string' ? expectedToken.trim() : '';
  if (!expected) {
    return false;
  }

  const candidateRaw = Array.isArray(receivedToken)
    ? receivedToken[0]
    : receivedToken;
  const candidate =
    typeof candidateRaw === 'string' ? candidateRaw.trim() : '';
  if (!candidate) {
    return false;
  }

  const expectedBuf = Buffer.from(expected, 'utf8');
  const candidateBuf = Buffer.from(candidate, 'utf8');

  if (expectedBuf.length !== candidateBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, candidateBuf);
}

@Controller('whatsapp')
export class WhatsappSendController {
  constructor(
    private readonly whatsappAdminSendService: WhatsappAdminSendService,
  ) {}

  /**
   * Admin manual WhatsApp sender (CRM UI).
   * Protected by JWT + ADMIN role. Accepts `multipart/form-data` with:
   * - `agentKey` (optional, default `booking`)
   * - `to` (required recipient phone)
   * - `message` (optional text / caption)
   * - `file` (optional single attachment: .pdf, .docx, .xlsx, .txt, .mp3, .mp4)
   */
  @Post('admin/send')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 101 * 1024 * 1024 },
    }),
  )
  async adminSend(
    @Body() body: WhatsappMultipartBody,
    @UploadedFile() file: RawUploadedFile | undefined,
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
  ) {
    return this.whatsappAdminSendService.sendManual({
      agentKey: body?.agentKey,
      to: body?.to ?? '',
      message: body?.message,
      file: file ?? null,
      actor: {
        id: actor?.id ?? null,
        email: actor?.email ?? null,
      },
      ip,
      source: 'admin_ui',
    });
  }

  /**
   * CLI manual WhatsApp sender (`tools/whatsapp_send.py` on DGX).
   * Protected by `x-whatsapp-cli-token` compared fail-closed against `WHATSAPP_CLI_TOKEN`.
   */
  @Post('cli/send')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 101 * 1024 * 1024 },
    }),
  )
  async cliSend(
    @Headers('x-whatsapp-cli-token') cliToken: string | string[] | undefined,
    @Body() body: WhatsappMultipartBody,
    @UploadedFile() file: RawUploadedFile | undefined,
    @Ip() ip: string,
  ) {
    if (!verifyWhatsappCliToken(cliToken)) {
      throw new UnauthorizedException(
        'Token CLI inválido o WHATSAPP_CLI_TOKEN no configurado en el servidor.',
      );
    }

    return this.whatsappAdminSendService.sendManual({
      agentKey: body?.agentKey,
      to: body?.to ?? '',
      message: body?.message,
      file: file ?? null,
      actor: {
        id: null,
        email: 'whatsapp-cli@local',
      },
      ip,
      source: 'cli',
    });
  }
}
