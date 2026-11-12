import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { MiembroGrupo } from './miembro-grupo.entity';

@Entity('gruposcontactos')
export class GrupoContacto {
  @PrimaryColumn({ type: 'varchar', length: 80, name: 'grupocontacto' })
  grupocontacto: string;

  @Column({ type: 'text', nullable: true, name: 'descripciongrupo' })
  descripciongrupo: string | null;

  @CreateDateColumn({ name: 'fechacreacion', type: 'timestamp with time zone' })
  fechacreacion: Date;

  @OneToMany(() => MiembroGrupo, (m) => m.grupo)
  miembros: MiembroGrupo[];
}
