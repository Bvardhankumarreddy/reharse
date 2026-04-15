import {
  Controller, Get, Patch, Param, Query, Body, UseGuards, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { AdminService } from './admin.service';

@Controller('api/v1/admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /** GET /api/v1/admin/stats — overview metrics */
  @Get('stats')
  getStats() {
    return this.adminService.getStats();
  }

  /** GET /api/v1/admin/users — paginated user list */
  @Get('users')
  getUsers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('tier') tier?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.getUsers({ page, limit, search, tier, status });
  }

  /** GET /api/v1/admin/users/:id — full user detail */
  @Get('users/:id')
  getUserDetail(@Param('id') id: string) {
    return this.adminService.getUserDetail(id);
  }

  /** PATCH /api/v1/admin/users/:id — update isAdmin or subscriptionTier */
  @Patch('users/:id')
  updateUser(
    @Param('id') id: string,
    @Body() body: { isAdmin?: boolean; subscriptionTier?: string; subscriptionStatus?: string },
  ) {
    return this.adminService.updateUser(id, body);
  }

  /** GET /api/v1/admin/feedback — user submitted feedback/bugs */
  @Get('feedback')
  getFeedback(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('category') category?: string,
  ) {
    return this.adminService.getFeedback({ page, limit, category });
  }

  /** GET /api/v1/admin/revenue — subscription revenue breakdown */
  @Get('revenue')
  getRevenue() {
    return this.adminService.getRevenue();
  }
}
