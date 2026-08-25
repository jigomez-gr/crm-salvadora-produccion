import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class PlaygroundDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  threadId?: string;
}
