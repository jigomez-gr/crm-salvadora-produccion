import { IsString, MaxLength, MinLength } from 'class-validator';

// The strong-password policy itself is enforced in UsersService
// (passwordPolicyIssues, shared with the frontend). Here we only guard the
// shape/length so malformed payloads are rejected early by the ValidationPipe.
export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  currentPassword: string;

  @IsString()
  @MaxLength(200)
  newPassword: string;
}
