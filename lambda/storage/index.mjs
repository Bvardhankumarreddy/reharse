/**
 * Rehearse — Resume Storage Lambda
 *
 * Deployed with a Lambda Function URL (auth type: NONE).
 * Security is handled by validating x-secret against LAMBDA_SECRET env var.
 *
 * IAM execution role grants s3:PutObject/GetObject/DeleteObject on the bucket.
 * No AWS credentials anywhere in NestJS — just a URL + shared secret.
 *
 * Routes:
 *   POST   /upload   — upload a file buffer (base64 body) → returns { key }
 *   POST   /presign  — generate a presigned GET URL       → returns { url }
 *   DELETE /object   — delete an S3 object                → returns { ok }
 *
 * Environment variables (set in Lambda console):
 *   BUCKET_NAME    — e.g. rehearse-resumes-prod
 *   LAMBDA_SECRET  — shared secret, must match STORAGE_LAMBDA_SECRET in NestJS
 *   AWS_REGION     — set automatically by Lambda runtime
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const s3            = new S3Client({ region: process.env.AWS_REGION ?? 'us-east-1' });
const BUCKET        = process.env.BUCKET_NAME;
const LAMBDA_SECRET = process.env.LAMBDA_SECRET;

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok(body)  { return { statusCode: 200, headers: cors(), body: JSON.stringify(body) }; }
function err(code, msg) { return { statusCode: code, headers: cors(), body: JSON.stringify({ error: msg }) }; }
function cors() { return { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }; }

function parseBody(event) {
  try { return JSON.parse(event.body ?? '{}'); } catch { return {}; }
}

// ── Route: POST /upload ───────────────────────────────────────────────────────
// Body: { key: string, content: string (base64), contentType: string }
// Returns: { key }

async function upload(event) {
  const { key, content, contentType } = parseBody(event);
  if (!key || !content || !contentType) return err(400, 'key, content, contentType required');
  if (!BUCKET) return err(500, 'BUCKET_NAME env not set');

  // Validate key structure — only allow resumes/{userId}/... to prevent arbitrary writes
  if (!key.startsWith('resumes/')) return err(403, 'Invalid key prefix');

  const buffer = Buffer.from(content, 'base64');

  // Enforce 5 MB limit (API Gateway allows up to 10 MB payload)
  if (buffer.byteLength > 5 * 1024 * 1024) return err(413, 'File exceeds 5 MB limit');

  await s3.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    Body:        buffer,
    ContentType: contentType,
  }));

  return ok({ key });
}

// ── Route: POST /presign ──────────────────────────────────────────────────────
// Body: { key: string, expiresIn?: number }
// Returns: { url }

async function presign(event) {
  const { key, expiresIn = 900 } = parseBody(event);
  if (!key) return err(400, 'key required');
  if (!BUCKET) return err(500, 'BUCKET_NAME env not set');
  if (!key.startsWith('resumes/')) return err(403, 'Invalid key prefix');

  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  const url     = await getSignedUrl(s3, command, { expiresIn });

  return ok({ url });
}

// ── Route: DELETE /object ─────────────────────────────────────────────────────
// Body: { key: string }
// Returns: { ok: true }

async function remove(event) {
  const { key } = parseBody(event);
  if (!key) return err(400, 'key required');
  if (!BUCKET) return err(500, 'BUCKET_NAME env not set');
  if (!key.startsWith('resumes/')) return err(403, 'Invalid key prefix');

  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));

  return ok({ ok: true });
}


// ── Route: POST /email/send ───────────────────────────────────────────────────
// Body: { to: string, subject: string, html: string, text: string }
// Returns: { messageId }

async function sendEmail(event) {
  const { to, subject, html, text } = parseBody(event);
  if (!to || !subject || !html) return err(400, 'to, subject, html required');
  if (!process.env.SES_FROM_EMAIL) return err(500, 'SES_FROM_EMAIL env not set');

  const ses = new SESClient({ region: process.env.AWS_REGION ?? 'ap-south-1' });

  try {
    const cmd = new SendEmailCommand({
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: html,  Charset: 'UTF-8' },
          Text: { Data: text ?? '', Charset: 'UTF-8' },
        },
      },
      Source: process.env.SES_FROM_EMAIL,
    });

    const res = await ses.send(cmd);
    return ok({ messageId: res.MessageId });
  } catch (e) {
    return err(502, `SES error: ${e.name} — ${e.message}`);
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

function isAuthorized(event) {
  if (!LAMBDA_SECRET) return false; // Refuse all requests if secret not configured
  const incoming = event.headers?.['x-secret'] ?? event.headers?.['X-Secret'] ?? '';
  return incoming === LAMBDA_SECRET;
}

// ── Router ────────────────────────────────────────────────────────────────────

export const handler = async (event) => {
  const method = event.requestContext?.http?.method ?? event.httpMethod ?? 'GET';
  const path   = event.rawPath ?? event.path ?? '/';

  // CORS preflight — no auth needed
  if (method === 'OPTIONS') {
    return { statusCode: 200, headers: cors(), body: '' };
  }

  // Validate shared secret on every request
  if (!isAuthorized(event)) {
    return err(401, 'Unauthorized');
  }

  if (method === 'POST'   && path === '/upload')  return upload(event);
  if (method === 'POST'   && path === '/presign')  return presign(event);
  if (method === 'DELETE' && path === '/object')   return remove(event);
  if (method === 'POST' && path === '/email/send') return sendEmail(event);

  return err(404, `No route: ${method} ${path}`);
};
