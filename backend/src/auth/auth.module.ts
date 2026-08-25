import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { UsersModule } from '../users/users.module';
import { getJwtSecret, TOKEN_TTL_SECONDS } from './auth.constants';

// NOT @Global on purpose: a global module gets registered after the rest, which
// would place AuthController/UsersController AFTER Mastra's `/api/*` catch-all
// (AgentsModule) and shadow them. Importing it explicitly into the domain
// modules keeps its routes registered early — before the catch-all.
@Module({
  imports: [
    UsersModule,
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: TOKEN_TTL_SECONDS },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, RolesGuard],
  // Re-export UsersModule (not just JwtModule): JwtAuthGuard now depends on
  // UsersService, and `@UseGuards(JwtAuthGuard)` instantiates the guard in each
  // CONSUMING module's context — so every module importing AuthModule must be
  // able to resolve UsersService too, not only JwtService.
  exports: [JwtAuthGuard, RolesGuard, JwtModule, UsersModule],
})
export class AuthModule {}
