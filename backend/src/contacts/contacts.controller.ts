import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Header,
  HttpCode,
  HttpStatus,
  Ip,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ContactsService } from './contacts.service';
import {
  CreateContactDto,
  UpdateContactDto,
  ImportContactsDto,
  SetConsentDto,
  ReorderBoardDto,
} from './dto/contact.dto';
import { QueryContactsDto } from './dto/query-contacts.dto';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { AUDIT_EVENT, AuditAction, AuditRecord } from '../audit/audit.types';

@Controller('contacts')
@UseGuards(JwtAuthGuard)
export class ContactsController {
  constructor(
    private readonly contactsService: ContactsService,
    private readonly events: EventEmitter2,
  ) {}

  private audit(record: AuditRecord): void {
    this.events.emit(AUDIT_EVENT, record);
  }

  @Get()
  findAll(@Query() query: QueryContactsDto) {
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = query.offset ?? 0;
    return this.contactsService.list({
      limit,
      offset,
      search: query.search,
      status: query.status,
    });
  }

  // Static segments before the `:id` route so they aren't captured as an id.

  /** Full pipeline board (Kanban): contacts grouped by funnel stage. */
  @Get('board')
  board() {
    return this.contactsService.board();
  }

  /**
   * Lightweight per-stage counts for the dashboard mini-funnel — one GROUP BY,
   * no card payload. Declared before `board/reorder`/`:id` so it isn't shadowed.
   */
  @Get('board/summary')
  boardSummary() {
    return this.contactsService.pipelineSummary();
  }

  /** Move/reorder a pipeline column (drag-and-drop): renumber it server-side. */
  @Post('board/reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  reorderBoard(@Body() dto: ReorderBoardDto) {
    return this.contactsService.reorderStage(dto.stage, dto.orderedIds);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="contactos.csv"')
  exportCsv() {
    return this.contactsService.exportCsv();
  }

  @Post('import')
  async importCsv(
    @Body() dto: ImportContactsDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
  ) {
    const result = await this.contactsService.importCsv(dto.csv);
    this.audit({
      actor: { id: actor.id, email: actor.email },
      action: AuditAction.CONTACT_IMPORT,
      summary: `Importó contactos por CSV (${result.created} nuevos, ${result.updated} actualizados, ${result.skipped} omitidos)`,
      targetType: 'contact',
      ip,
      metadata: {
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
      },
    });
    return result;
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contactsService.findOne(id);
  }

  @Post()
  async create(
    @Body() dto: CreateContactDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
  ) {
    const contact = await this.contactsService.create(dto);
    this.audit({
      actor: { id: actor.id, email: actor.email },
      action: AuditAction.CONTACT_CREATE,
      summary: `Creó el contacto ${contact.name} (${contact.phone})`,
      targetType: 'contact',
      targetId: contact.id,
      ip,
    });
    return contact;
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateContactDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
  ) {
    const contact = await this.contactsService.update(id, dto);
    this.audit({
      actor: { id: actor.id, email: actor.email },
      action: AuditAction.CONTACT_UPDATE,
      summary: `Actualizó el contacto ${contact.name}`,
      targetType: 'contact',
      targetId: contact.id,
      ip,
      metadata: { changed: Object.keys(dto) },
    });
    return contact;
  }

  @Post(':id/consent')
  async setConsent(
    @Param('id') id: string,
    @Body() dto: SetConsentDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
  ) {
    const contact = await this.contactsService.setOptOut(id, dto.optedOut);
    this.audit({
      actor: { id: actor.id, email: actor.email },
      action: dto.optedOut
        ? AuditAction.CONTACT_OPT_OUT
        : AuditAction.CONTACT_OPT_IN,
      summary: dto.optedOut
        ? `Marcó como baja (opt-out) a ${contact.name}`
        : `Reactivó los mensajes (opt-in) de ${contact.name}`,
      targetType: 'contact',
      targetId: contact.id,
      ip,
    });
    return contact;
  }

  @Post(':id/anonymize')
  async anonymize(
    @Param('id') id: string,
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
  ) {
    // Capture the name before scrubbing so the audit entry is meaningful.
    const before = await this.contactsService.findOne(id);
    const contact = await this.contactsService.anonymize(id);
    this.audit({
      actor: { id: actor.id, email: actor.email },
      action: AuditAction.CONTACT_ANONYMIZE,
      summary: `Anonimizó (GDPR) el contacto ${before.name}`,
      targetType: 'contact',
      targetId: contact.id,
      ip,
    });
    return contact;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
  ) {
    const contact = await this.contactsService.findOne(id);
    await this.contactsService.remove(id);
    this.audit({
      actor: { id: actor.id, email: actor.email },
      action: AuditAction.CONTACT_DELETE,
      summary: `Eliminó el contacto ${contact.name} (${contact.phone})`,
      targetType: 'contact',
      targetId: id,
      ip,
    });
  }
}
