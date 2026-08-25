import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Call, CallDirection, CallStatus } from '../common/entities/call.entity';

export interface CallsQueryDto {
  limit?: number;
  offset?: number;
  direction?: CallDirection;
  status?: CallStatus;
  needsReview?: boolean;
  contactId?: string;
  search?: string;
}

@Injectable()
export class CallsService {
  constructor(
    @InjectRepository(Call)
    private readonly callsRepo: Repository<Call>,
  ) {}

  async findAll(query: CallsQueryDto = {}) {
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const offset = Math.max(Number(query.offset) || 0, 0);

    const qb = this.callsRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.contact', 'contact')
      .orderBy('c.startedAt', 'DESC');

    if (query.direction) {
      qb.andWhere('c.direction = :dir', { dir: query.direction });
    }

    if (query.status) {
      qb.andWhere('c.status = :status', { status: query.status });
    }

    if (query.needsReview !== undefined) {
      qb.andWhere('c.needsReview = :review', { review: query.needsReview });
    }

    if (query.contactId) {
      qb.andWhere('c.contactId = :cid', { cid: query.contactId });
    }

    if (query.search && query.search.trim() !== '') {
      const s = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(c.fromNumber) LIKE :s OR LOWER(c.toNumber) LIKE :s OR LOWER(c.summary) LIKE :s OR LOWER(contact.name) LIKE :s)',
        { s },
      );
    }

    const [items, total] = await qb.skip(offset).take(limit).getManyAndCount();

    return {
      items,
      total,
      limit,
      offset,
    };
  }

  async findOne(id: string): Promise<Call> {
    const call = await this.callsRepo.findOne({
      where: { id },
      relations: ['contact'],
    });
    if (!call) throw new NotFoundException(`Llamada con ID ${id} no encontrada.`);
    return call;
  }

  async update(id: string, dto: { notes?: string; needsReview?: boolean }): Promise<Call> {
    const call = await this.findOne(id);
    if (dto.notes !== undefined) call.notes = dto.notes;
    if (dto.needsReview !== undefined) call.needsReview = dto.needsReview;
    return this.callsRepo.save(call);
  }

  async remove(id: string): Promise<void> {
    const call = await this.findOne(id);
    await this.callsRepo.remove(call);
  }

  async getStats() {
    const total = await this.callsRepo.count();
    const needsReview = await this.callsRepo.count({ where: { needsReview: true } });

    const raw = await this.callsRepo
      .createQueryBuilder('c')
      .select('SUM(c.durationSeconds)', 'totalDuration')
      .addSelect('SUM(c.costCents)', 'totalCost')
      .getRawOne();

    return {
      totalCalls: total,
      needsReviewCount: needsReview,
      totalDurationSeconds: Number(raw?.totalDuration) || 0,
      totalCostCents: Number(raw?.totalCost) || 0,
    };
  }
}
