import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsEmail } from 'class-validator';

export class AnalizaIaPublicRequestDto {
  @IsString()
  @IsNotEmpty()
  servicio: string;

  @IsString()
  @IsNotEmpty()
  imagenBase64: string;

  @IsString()
  @IsOptional()
  imagenContentType?: string;

  @IsString()
  @IsOptional()
  contexto?: string;

  @IsString()
  @IsOptional()
  patientName?: string;

  @IsString()
  @IsOptional()
  phone?: string;
}

export class AnalizaIaEnviarPeticionDto {
  @IsString()
  @IsOptional()
  idUsuario?: string;

  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsString()
  @IsOptional()
  apellidos?: string;

  @IsString()
  @IsNotEmpty()
  telefono: string;

  @IsEmail()
  @IsNotEmpty()
  correo: string;

  @IsString()
  @IsOptional()
  telegramId?: string;

  @IsString()
  @IsNotEmpty()
  servicioCodigo: string;

  @IsString()
  @IsOptional()
  servicioNombre?: string;

  @IsEmail()
  @IsNotEmpty()
  doctorCorreo: string;

  @IsString()
  @IsOptional()
  doctorNombre?: string;

  @IsString()
  @IsNotEmpty()
  canalRespuesta: 'email' | 'whatsapp' | 'telegram' | string;

  @IsString()
  @IsOptional()
  motivoPaciente?: string;

  @IsString()
  @IsOptional()
  imagenBase64?: string;

  @IsString()
  @IsOptional()
  imagenContentType?: string;

  @IsString()
  @IsNotEmpty()
  diagnosticoIA: string;

  @IsBoolean()
  @IsNotEmpty()
  consentimiento: boolean;
}
