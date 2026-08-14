import { Body, Controller, Get, Header, HttpCode, Patch, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppError } from '../common/app-error';
import { runtimeConfig } from '../common/runtime-config';
import { Public } from './auth.decorators';
import { LoginDto, UpdateAccountDto } from './auth.dto';
import { AuthService, SESSION_COOKIE } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';
import { clientIp } from './client-ip';
import { LoginProtectionService } from './login-protection.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly protection: LoginProtectionService,
  ) {}

  @Public()
  @Get('captcha')
  @Header('Cache-Control', 'no-store')
  captcha(@Req() request: Request) {
    return this.protection.createCaptcha(clientIp(request));
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async login(
    @Body() input: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const ip = clientIp(request);
    this.protection.assertNotLocked(ip);
    try {
      this.protection.consumeCaptcha(input.captchaId, input.captchaCode);
    } catch (error) {
      if (error instanceof AppError && error.code === 'INVALID_CAPTCHA') {
        this.protection.recordFailure(ip);
      }
      throw error;
    }

    try {
      const result = await this.auth.login(input.username, input.password);
      this.protection.clearFailures(ip);
      response.cookie(SESSION_COOKIE, result.token, this.cookieOptions(result.expiresAt));
      return this.auth.serializeAdmin(result.admin);
    } catch (error) {
      if (error instanceof AppError && error.code === 'INVALID_CREDENTIALS') {
        this.protection.recordFailure(ip);
      }
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(request.cookies?.[SESSION_COOKIE] as string | undefined);
    response.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }

  @Get('me')
  me(@Req() request: AuthenticatedRequest) {
    return this.auth.serializeAdmin(request.admin);
  }

  @Patch('account')
  async update(@Req() request: AuthenticatedRequest, @Body() input: UpdateAccountDto) {
    return this.auth.serializeAdmin(await this.auth.updateAccount(request.admin, input));
  }

  private cookieOptions(expires?: Date) {
    return {
      httpOnly: true,
      sameSite: 'strict' as const,
      secure: runtimeConfig.sessionCookieSecure,
      path: '/',
      ...(expires ? { expires } : {}),
    };
  }
}
