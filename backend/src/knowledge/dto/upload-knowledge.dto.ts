import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * A knowledge-base file uploaded as base64 in a JSON body (same pattern as the
 * CSV import — avoids adding multer/multipart to the attack surface and rides the
 * existing 6 MB JSON body limit). `contentBase64` may be a bare base64 string or
 * a `data:<mime>;base64,...` data URL; the service strips the prefix. The length
 * cap (~5.6 M chars) corresponds to the ~4 MB original-file limit after base64
 * inflation (well under the 6 MB body limit).
 */
export class UploadKnowledgeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(400)
  filename: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5_600_000)
  contentBase64: string;
}
