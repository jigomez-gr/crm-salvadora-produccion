import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServiceCategory } from '../common/entities/service-category.entity';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(ServiceCategory)
    private readonly categoryRepo: Repository<ServiceCategory>,
  ) {}

  async findAll(activeOnly = false): Promise<ServiceCategory[]> {
    const qb = this.categoryRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.services', 'services')
      .orderBy('c.displayOrder', 'ASC')
      .addOrderBy('c.name', 'ASC');

    if (activeOnly) {
      qb.where('c.isActive = :active', { active: true });
    }

    return qb.getMany();
  }

  async findOne(id: string): Promise<ServiceCategory> {
    const category = await this.categoryRepo.findOne({
      where: { id },
      relations: ['services'],
    });
    if (!category) {
      throw new NotFoundException(`Categoría con ID ${id} no encontrada`);
    }
    return category;
  }

  async findByCode(code: string): Promise<ServiceCategory | null> {
    return this.categoryRepo.findOne({
      where: { code: code.trim().toLowerCase() },
      relations: ['services'],
    });
  }

  async create(dto: CreateCategoryDto): Promise<ServiceCategory> {
    const normalizedCode = dto.code.trim().toLowerCase();
    const existing = await this.categoryRepo.findOne({ where: { code: normalizedCode } });
    if (existing) {
      throw new ConflictException(`Ya existe una categoría con el código "${normalizedCode}"`);
    }

    const category = this.categoryRepo.create({
      code: normalizedCode,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      displayOrder: dto.displayOrder ?? 0,
      isActive: dto.isActive ?? true,
    });

    return this.categoryRepo.save(category);
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<ServiceCategory> {
    const category = await this.findOne(id);

    if (dto.code && dto.code.trim().toLowerCase() !== category.code) {
      const normalizedCode = dto.code.trim().toLowerCase();
      const existing = await this.categoryRepo.findOne({ where: { code: normalizedCode } });
      if (existing && existing.id !== id) {
        throw new ConflictException(`Ya existe una categoría con el código "${normalizedCode}"`);
      }
      category.code = normalizedCode;
    }

    if (dto.name !== undefined) category.name = dto.name.trim();
    if (dto.description !== undefined) category.description = dto.description ? dto.description.trim() : null;
    if (dto.displayOrder !== undefined) category.displayOrder = dto.displayOrder;
    if (dto.isActive !== undefined) category.isActive = dto.isActive;

    return this.categoryRepo.save(category);
  }

  async remove(id: string): Promise<void> {
    const category = await this.findOne(id);
    await this.categoryRepo.remove(category);
  }
}
