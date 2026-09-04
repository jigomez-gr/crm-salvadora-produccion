import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class WidgetVapiCallDto {
  @IsString()
  @IsNotEmpty({ message: 'El número de teléfono es obligatorio.' })
  phoneNumber: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  agentKey?: string;

  @IsString()
  @IsOptional()
  sessionId?: string;

  @IsString()
  @IsOptional()
  inquiry?: string;
}
