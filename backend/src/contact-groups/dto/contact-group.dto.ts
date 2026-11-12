import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateGrupoContactoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  grupocontacto: string;

  @IsString()
  @IsOptional()
  descripciongrupo?: string;
}

export class UpdateGrupoContactoDto {
  @IsString()
  @IsOptional()
  descripciongrupo?: string;
}

export class AddMiembroDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  movil: string;

  @IsString()
  @IsOptional()
  contactId?: string;
}
