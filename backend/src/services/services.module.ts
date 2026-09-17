import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Service } from '../common/entities/service.entity';
import { ServiceCategory } from '../common/entities/service-category.entity';
import { User } from '../common/entities/user.entity';
import { Appointment } from '../common/entities/appointment.entity';
import { AgentConfig } from '../common/entities/agent-config.entity';
import { KnowledgeDocument } from '../common/entities/knowledge-document.entity';
import { KnowledgeChunk } from '../common/entities/knowledge-chunk.entity';
import { ServicesService } from './services.service';
import { ServicesController } from './services.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Service,
      ServiceCategory,
      User,
      Appointment,
      AgentConfig,
      KnowledgeDocument,
      KnowledgeChunk,
    ]),
    AuthModule,
  ],
  controllers: [ServicesController],
  providers: [ServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}