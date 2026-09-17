import { Injectable, NotFoundException, ConflictException, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import type { Response } from 'express';
import { MediaAsset, MediaType } from '../common/entities/media-asset.entity';
import { CreateMediaAssetDto, UpdateMediaAssetDto } from './dto/media.dto';

@Injectable()
export class MediaService implements OnModuleInit {
  private readonly logger = new Logger(MediaService.name);

  // Storage root and directories from environment variables
  private readonly storageRoot: string =
    process.env.MEDIA_STORAGE_ROOT || path.resolve(process.cwd(), 'media_storage');
  private readonly videosDir: string =
    process.env.MEDIA_VIDEOS_DIR || path.join(this.storageRoot, 'videos');
  private readonly documentsDir: string =
    process.env.MEDIA_DOCUMENTS_DIR || path.join(this.storageRoot, 'documentos');
  private readonly flyersDir: string =
    process.env.MEDIA_FLYERS_DIR || path.join(this.storageRoot, 'flyers');

  constructor(
    @InjectRepository(MediaAsset)
    private readonly mediaRepo: Repository<MediaAsset>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      // Ensure storage directories exist
      if (!fs.existsSync(this.storageRoot)) {
        fs.mkdirSync(this.storageRoot, { recursive: true });
      }
      if (!fs.existsSync(this.videosDir)) {
        fs.mkdirSync(this.videosDir, { recursive: true });
      }
      if (!fs.existsSync(this.documentsDir)) {
        fs.mkdirSync(this.documentsDir, { recursive: true });
      }
      if (!fs.existsSync(this.flyersDir)) {
        fs.mkdirSync(this.flyersDir, { recursive: true });
      }

      // Check if any media assets exist; if none, seed default known assets
      const count = await this.mediaRepo.count();
      if (count === 0) {
        await this.seedInitialAssets();
      }
    } catch (err) {
      this.logger.warn(`Media initialization notice: ${err}`);
    }
  }

  private async seedInitialAssets(): Promise<void> {
    const initialAssets: Partial<MediaAsset>[] = [
      {
        key: 'hero_video',
        title: 'Vídeo Portada Centro (Hero)',
        mediaType: MediaType.VIDEO,
        mimeType: 'video/mp4',
        physicalPath: path.join(this.videosDir, 'hero.mp4'),
        publicUrl: '/videos/hero.mp4',
        displayOrder: 1,
        isActive: true,
      },
      {
        key: 'prologo_video',
        title: 'Vídeo Prólogo Escuela Salvadora Conesa',
        mediaType: MediaType.VIDEO,
        mimeType: 'video/mp4',
        physicalPath: path.join(this.videosDir, 'prologo.mp4'),
        publicUrl: '/videos/prologo.mp4',
        displayOrder: 2,
        isActive: true,
      },
      {
        key: 'previo_ayunos_video',
        title: 'Vídeo Retiro de Ayuno Consciente',
        mediaType: MediaType.VIDEO,
        mimeType: 'video/mp4',
        physicalPath: path.join(this.videosDir, 'previo_ayunos.mp4'),
        publicUrl: '/videos/previo_ayunos.mp4',
        displayOrder: 3,
        isActive: true,
      },
      {
        key: 'flyer_yoga',
        title: 'Flyer Hatha Yoga Terapéutico',
        mediaType: MediaType.FLYER,
        mimeType: 'image/jpeg',
        physicalPath: path.join(this.flyersDir, 'yoga.jpeg'),
        publicUrl: '/flyers/yoga.jpeg',
        displayOrder: 10,
        isActive: true,
      },
      {
        key: 'flyer_bienestar',
        title: 'Flyer Bienestar Experience & Longevidad',
        mediaType: MediaType.FLYER,
        mimeType: 'image/png',
        physicalPath: path.join(this.flyersDir, 'bienestar.png'),
        publicUrl: '/flyers/bienestar.png',
        displayOrder: 11,
        isActive: true,
      },
      {
        key: 'flyer_iaido',
        title: 'Flyer Iaidō (Esgrima Japonesa)',
        mediaType: MediaType.FLYER,
        mimeType: 'image/jpeg',
        physicalPath: path.join(this.flyersDir, 'iaido.jpg'),
        publicUrl: '/flyers/iaido.jpg',
        displayOrder: 12,
        isActive: true,
      },
      {
        key: 'flyer_gong',
        title: 'Flyer Baño de Gong',
        mediaType: MediaType.FLYER,
        mimeType: 'image/jpeg',
        physicalPath: path.join(this.flyersDir, 'banogong.jpeg'),
        publicUrl: '/flyers/banogong.jpeg',
        displayOrder: 13,
        isActive: true,
      },
      {
        key: 'flyer_constelaciones',
        title: 'Flyer Constelaciones Familiares',
        mediaType: MediaType.FLYER,
        mimeType: 'image/jpeg',
        physicalPath: path.join(this.flyersDir, 'constalaciones.jpeg'),
        publicUrl: '/flyers/constalaciones.jpeg',
        displayOrder: 14,
        isActive: true,
      },
      {
        key: 'flyer_gestalt',
        title: 'Flyer Terapia Gestalt',
        mediaType: MediaType.FLYER,
        mimeType: 'image/jpeg',
        physicalPath: path.join(this.flyersDir, 'gestalt.jpeg'),
        publicUrl: '/flyers/gestalt.jpeg',
        displayOrder: 15,
        isActive: true,
      },
      {
        key: 'flyer_ayuno',
        title: 'Flyer Retiro de Ayuno',
        mediaType: MediaType.FLYER,
        mimeType: 'image/jpeg',
        physicalPath: path.join(this.flyersDir, 'ayuno.jpeg'),
        publicUrl: '/flyers/ayuno.jpeg',
        displayOrder: 16,
        isActive: true,
      },
      {
        key: 'flyer_mujeres',
        title: 'Flyer Encuentro de Mujeres',
        mediaType: MediaType.FLYER,
        mimeType: 'image/jpeg',
        physicalPath: path.join(this.flyersDir, 'encuentros_mujeres.jpeg'),
        publicUrl: '/flyers/encuentros_mujeres.jpeg',
        displayOrder: 17,
        isActive: true,
      },
      {
        key: 'flyer_meditacion',
        title: 'Flyer Meditaciones Guiadas',
        mediaType: MediaType.FLYER,
        mimeType: 'image/jpeg',
        physicalPath: path.join(this.flyersDir, 'meditacion.jpeg'),
        publicUrl: '/flyers/meditacion.jpeg',
        displayOrder: 18,
        isActive: true,
      },
    ];

    for (const item of initialAssets) {
      const asset = this.mediaRepo.create(item);
      await this.mediaRepo.save(asset);
    }
    this.logger.log(`Seeded ${initialAssets.length} default media asset configurations in Postgres.`);
  }

  async findAll(type?: string, activeOnly = false): Promise<MediaAsset[]> {
    const qb = this.mediaRepo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.service', 'service')
      .orderBy('m.displayOrder', 'ASC')
      .addOrderBy('m.title', 'ASC');

    if (type) {
      qb.andWhere('m.mediaType = :type', { type });
    }
    if (activeOnly) {
      qb.andWhere('m.isActive = :active', { active: true });
    }

    return qb.getMany();
  }

  async findOne(id: string): Promise<MediaAsset> {
    const asset = await this.mediaRepo.findOne({
      where: { id },
      relations: ['service'],
    });
    if (!asset) {
      throw new NotFoundException(`Media asset con ID ${id} no encontrado`);
    }
    return asset;
  }

  async findByKey(key: string): Promise<MediaAsset | null> {
    return this.mediaRepo.findOne({
      where: { key: key.trim().toLowerCase() },
      relations: ['service'],
    });
  }

  async create(dto: CreateMediaAssetDto): Promise<MediaAsset> {
    const normalizedKey = dto.key.trim().toLowerCase();
    const existing = await this.findByKey(normalizedKey);
    if (existing) {
      throw new ConflictException(`Ya existe un archivo multimedia con la clave "${normalizedKey}"`);
    }

    const asset = this.mediaRepo.create({
      ...dto,
      key: normalizedKey,
      mediaType: dto.mediaType || MediaType.VIDEO,
      displayOrder: dto.displayOrder ?? 0,
      isActive: dto.isActive ?? true,
      metadata: dto.metadata || {},
    });

    return this.mediaRepo.save(asset);
  }

  async update(id: string, dto: UpdateMediaAssetDto): Promise<MediaAsset> {
    const asset = await this.findOne(id);

    if (dto.key && dto.key.trim().toLowerCase() !== asset.key) {
      const normalizedKey = dto.key.trim().toLowerCase();
      const existing = await this.findByKey(normalizedKey);
      if (existing && existing.id !== id) {
        throw new ConflictException(`Ya existe un archivo multimedia con la clave "${normalizedKey}"`);
      }
      asset.key = normalizedKey;
    }

    if (dto.title !== undefined) asset.title = dto.title.trim();
    if (dto.mediaType !== undefined) asset.mediaType = dto.mediaType;
    if (dto.mimeType !== undefined) asset.mimeType = dto.mimeType;
    if (dto.physicalPath !== undefined) asset.physicalPath = dto.physicalPath;
    if (dto.publicUrl !== undefined) asset.publicUrl = dto.publicUrl || null;
    if (dto.fileSizeBytes !== undefined) asset.fileSizeBytes = dto.fileSizeBytes;
    if (dto.serviceId !== undefined) asset.serviceId = dto.serviceId || null;
    if (dto.metadata !== undefined) asset.metadata = dto.metadata;
    if (dto.isActive !== undefined) asset.isActive = dto.isActive;
    if (dto.displayOrder !== undefined) asset.displayOrder = dto.displayOrder;

    return this.mediaRepo.save(asset);
  }

  async remove(id: string): Promise<void> {
    const asset = await this.findOne(id);
    await this.mediaRepo.remove(asset);
  }

  /**
   * Stream a media file directly from the filesystem outside git using HTTP 206 Partial Content (Range requests)
   */
  async streamMedia(keyOrId: string, rangeHeader: string | undefined, res: Response): Promise<void> {
    let asset = await this.findByKey(keyOrId);
    if (!asset) {
      asset = await this.mediaRepo.findOne({ where: { id: keyOrId } });
    }

    if (!asset) {
      throw new NotFoundException(`Media asset "${keyOrId}" no encontrado.`);
    }

    // Resolve physical path (support relative to storageRoot or absolute paths)
    let filePath = asset.physicalPath;
    if (!path.isAbsolute(filePath)) {
      filePath = path.resolve(this.storageRoot, filePath);
    }

    if (!fs.existsSync(filePath)) {
      // Fallback check: if publicUrl points to a local file in public directory
      const altPath = path.resolve(process.cwd(), asset.publicUrl ? asset.publicUrl.replace(/^\//, '') : '');
      if (fs.existsSync(altPath)) {
        filePath = altPath;
      } else {
        throw new NotFoundException(`El archivo físico en disco no existe: ${asset.physicalPath}`);
      }
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const contentType = asset.mimeType || 'application/octet-stream';

    if (rangeHeader) {
      // Parse Range header e.g. "bytes=0-1024"
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize) {
        res.status(416).set({
          'Content-Range': `bytes */${fileSize}`,
        });
        res.end();
        return;
      }

      const chunkSize = end - start + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
      });

      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
      });
      fs.createReadStream(filePath).pipe(res);
    }
  }
}
