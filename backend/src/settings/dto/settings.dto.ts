import {
  IsBoolean,
  IsHexColor,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Onboarding wizard payload: the business name + the chosen vertical preset. */
export class OnboardingDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  businessName: string;

  @IsString()
  @MaxLength(40)
  preset: string;
}

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  businessName?: string;

  @IsOptional()
  @IsHexColor()
  brandColor?: string;

  // A data: URL or external image URL. Empty string clears the logo.
  @IsOptional()
  @IsString()
  @MaxLength(2_000_000) // ~2 MB for an inline data: URL
  logoUrl?: string;

  @IsOptional()
  @IsBoolean()
  onboardingCompleted?: boolean;
}
