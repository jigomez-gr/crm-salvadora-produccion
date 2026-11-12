import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { GrupoContacto } from './grupo-contacto.entity';
import { Contact } from '../common/entities/contact.entity';

@Entity('miembrosgrupo')
@Index(['grupocontacto', 'movil'], { unique: true })
export class MiembroGrupo {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'varchar', length: 80, name: 'grupocontacto' })
  grupocontacto: string;

  @Index()
  @Column({ type: 'varchar', length: 64, name: 'movil' })
  movil: string;

  @CreateDateColumn({ name: 'campofechayhora', type: 'timestamp with time zone' })
  campofechayhora: Date;

  @Column({ name: 'contact_id', type: 'uuid', nullable: true })
  contactId: string | null;

  @ManyToOne(() => GrupoContacto, (g) => g.miembros, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'grupocontacto', referencedColumnName: 'grupocontacto' })
  grupo: GrupoContacto;

  @ManyToOne(() => Contact, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'contact_id' })
  contact: Contact | null;
}
