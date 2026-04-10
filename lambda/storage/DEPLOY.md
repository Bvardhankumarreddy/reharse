# Resume Storage Lambda — Deploy Guide

No API Gateway. Uses Lambda Function URL directly.
NestJS only needs: the Function URL + a shared secret string.

---

## 1. Create the S3 bucket

```bash
aws s3api create-bucket \
  --bucket rehearse-resumes-prod \
  --region ap-south-1 \
  --create-bucket-configuration LocationConstraint=ap-south-1

aws s3api put-public-access-block \
  --bucket rehearse-resumes-prod \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

---

## 2. Create the IAM role

**trust.json** — lets Lambda assume this role:
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "lambda.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
```

**permissions.json** — only the exact S3 actions needed:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::rehearse-resumes-prod/resumes/*"
    },
    {
      "Effect": "Allow",
      "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
      "Resource": "arn:aws:logs:*:*:*"
    }
  ]
}
```

```bash
aws iam create-role \
  --role-name rehearse-storage-lambda-role \
  --assume-role-policy-document file://trust.json

aws iam put-role-policy \
  --role-name rehearse-storage-lambda-role \
  --policy-name s3-resumes-access \
  --policy-document file://permissions.json
```

---

## 3. Deploy the Lambda

```bash
cd lambda/storage
npm install
zip -r storage.zip index.mjs node_modules/

# Generate a random secret (save this — you'll put it in NestJS .env too)
SECRET=$(openssl rand -hex 32)
echo "Your secret: $SECRET"

aws lambda create-function \
  --function-name rehearse-storage \
  --runtime nodejs20.x \
  --handler index.handler \
  --role arn:aws:iam::{ACCOUNT_ID}:role/rehearse-storage-lambda-role \
  --zip-file fileb://storage.zip \
  --environment Variables="{BUCKET_NAME=rehearse-resumes-prod,LAMBDA_SECRET=$SECRET}" \
  --region ap-south-1
```

**To update after code changes:**
```bash
zip -r storage.zip index.mjs node_modules/
aws lambda update-function-code \
  --function-name rehearse-storage \
  --zip-file fileb://storage.zip
```

---

## 4. Enable Function URL (no API Gateway needed)

```bash
aws lambda create-function-url-config \
  --function-name rehearse-storage \
  --auth-type NONE \
  --region ap-south-1
```

This returns a URL like:
```
https://abc123xyz.lambda-url.ap-south-1.on.aws
```

---

## 5. Set NestJS env vars

```env
# .env  (NestJS API)
STORAGE_LAMBDA_URL=https://abc123xyz.lambda-url.ap-south-1.on.aws
STORAGE_LAMBDA_SECRET=<the SECRET value from step 3>
```

**No AWS_ACCESS_KEY_ID. No AWS_SECRET_ACCESS_KEY. Ever.**

---

## Security model

| Layer | Protection |
|-------|-----------|
| S3 bucket | Fully private, zero public access |
| Lambda → S3 | IAM role — no credentials in code |
| Function URL | `auth-type: NONE` (public endpoint) |
| Request auth | `x-secret` header checked against `LAMBDA_SECRET` env var in Lambda |
| Key validation | Lambda rejects any S3 key not starting with `resumes/` |
| File size | Enforced at 5 MB before PutObject |
| Download URLs | Presigned, expire in 15 minutes |

The Function URL is public but useless without the secret.
The secret lives in Lambda env vars (set in AWS console) and NestJS env — never in code.
