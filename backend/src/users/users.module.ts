import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { User } from '../common/entities/user.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { getJwtSecret, TOKEN_TTL_SECONDS } from '../auth/auth.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    // JwtService for the JwtAuthGuard guarding UsersController. Imported here
    // (not via AuthModule) to avoid an Auth↔Users circular module dependency.
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: TOKEN_TTL_SECONDS },
    }),
  ],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
