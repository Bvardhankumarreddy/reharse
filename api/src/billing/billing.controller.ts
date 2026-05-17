import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  RawBodyRequest,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ClerkGuard } from '../auth/clerk.guard';
import { CurrentUser, type ClerkUser } from '../auth/current-user.decorator';
import { BillingService } from './billing.service';

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** GET /api/v1/billing/status */
  @ApiBearerAuth()
  @UseGuards(ClerkGuard)
  @Get('status')
  getStatus(@CurrentUser() user: ClerkUser) {
    return this.billing.getStatus(user.sub);
  }

  /**
   * POST /api/v1/billing/subscription
   * Creates a Razorpay subscription. Frontend opens the Razorpay modal with the returned ID.
   */
  @ApiBearerAuth()
  @UseGuards(ClerkGuard)
  @Post('subscription')
  createSubscription(@CurrentUser() user: ClerkUser) {
    // Only the ₹120/month recurring plan remains; longer terms are one-time
    // access passes (see /billing/access-pass).
    return this.billing.createSubscription(user.sub);
  }

  /**
   * POST /api/v1/billing/verify
   * Called by frontend after the Razorpay modal succeeds — verifies the payment signature.
   */
  @ApiBearerAuth()
  @UseGuards(ClerkGuard)
  @Post('verify')
  verify(
    @CurrentUser() user: ClerkUser,
    @Body('razorpay_payment_id')      paymentId:      string,
    @Body('razorpay_subscription_id') subscriptionId: string,
    @Body('razorpay_signature')       signature:      string,
  ) {
    if (!paymentId || !subscriptionId || !signature) {
      throw new BadRequestException('Missing payment fields');
    }
    return this.billing.verifyPayment(user.sub, paymentId, subscriptionId, signature);
  }

  /**
   * POST /api/v1/billing/cancel
   * Cancels the subscription at the end of the current billing cycle.
   */
  @ApiBearerAuth()
  @UseGuards(ClerkGuard)
  @Post('cancel')
  cancel(@CurrentUser() user: ClerkUser) {
    return this.billing.cancelSubscription(user.sub);
  }

  /**
   * POST /api/v1/billing/access-pass
   * Creates a Razorpay Order for a one-time access pass (3mo / 6mo / yearly).
   */
  @ApiBearerAuth()
  @UseGuards(ClerkGuard)
  @Post('access-pass')
  createAccessPass(
    @CurrentUser() user: ClerkUser,
    @Body('passType') passType: string,
  ) {
    if (passType !== '3mo' && passType !== '6mo' && passType !== 'yearly') {
      throw new BadRequestException('passType must be "3mo", "6mo", or "yearly"');
    }
    return this.billing.createAccessPass(user.sub, passType);
  }

  /**
   * POST /api/v1/billing/access-pass/verify
   * Verifies the Razorpay Order payment and activates Pro for the pass duration.
   */
  @ApiBearerAuth()
  @UseGuards(ClerkGuard)
  @Post('access-pass/verify')
  verifyAccessPass(
    @CurrentUser() user: ClerkUser,
    @Body('razorpay_payment_id') paymentId: string,
    @Body('razorpay_order_id')   orderId:   string,
    @Body('razorpay_signature')  signature: string,
  ) {
    if (!paymentId || !orderId || !signature) {
      throw new BadRequestException('Missing payment fields');
    }
    return this.billing.verifyAccessPass(user.sub, paymentId, orderId, signature);
  }

  /** GET /api/v1/billing/webhook — Razorpay pings this to verify the URL */
  @Get('webhook')
  @HttpCode(HttpStatus.OK)
  webhookPing() {
    return { ok: true };
  }

  /**
   * POST /api/v1/billing/webhook
   * Razorpay webhook — no ClerkGuard, verified by HMAC signature.
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') sig: string,
  ) {
    if (!req.rawBody) throw new BadRequestException('Missing raw body');
    if (!sig)         throw new BadRequestException('Missing Razorpay signature');
    return this.billing.handleWebhook(req.rawBody, sig);
  }
}
