import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

/** Update the business email account (all fields optional — partial update). */
export class UpdateEmailConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fromName?: string;

  @ValidateIf(
    (o) => o.fromAddress !== undefined && o.fromAddress !== null && o.fromAddress !== '',
  )
  @IsEmail()
  @MaxLength(200)
  fromAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  smtpHost?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  smtpPort?: number;

  @IsOptional()
  @IsBoolean()
  smtpSecure?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  smtpUser?: string;

  // Secret — leave blank to keep the stored one; the service ignores empty.
  @IsOptional()
  @IsString()
  @MaxLength(400)
  smtpPassword?: string;
}

/** Send a test email to verify the configuration (defaults to the from address). */
export class TestEmailDto {
  @ValidateIf((o) => o.to !== undefined && o.to !== null && o.to !== '')
  @IsEmail()
  @MaxLength(200)
  to?: string;
}

/** Send an email to a contact. */
export class SendEmailDto {
  @IsUUID()
  contactId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  subject: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50000)
  body: string;
}
