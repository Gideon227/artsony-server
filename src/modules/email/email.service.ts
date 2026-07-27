import nodemailer from 'nodemailer'
import Bull from 'bull'
import Redis from 'ioredis'
import { config } from '@/config'

// ─── Transport ────────────────────────────────────────────────────────────────

const transporter = nodemailer.createTransport({
  host: config.email.host,
  port: config.email.port,
  secure: config.email.secure,
  auth: { user: config.email.user, pass: config.email.password },
  pool: true,
  maxConnections: 5,
  rateLimit: 10, // max 10 messages per second
})

// ─── Queue (Bull backed by Redis) ─────────────────────────────────────────────
//
// Bull opens its own dedicated Redis connections (client/subscriber/bclient)
// separate from the app's main ioredis client. If those connections can't be
// established (connection cap reached, network issue, misconfigured host),
// Bull retries silently in the background by default — and since queue.add()
// awaits that connection, a slow/broken Redis previously meant this call, and
// therefore the whole HTTP request that triggered it (e.g. forgot-password),
// hung forever with no error surfaced anywhere.
//
// Fix: bound the connection attempt itself, log failures loudly, and race
// every add() against a hard timeout so this can never hang indefinitely.

const BULL_CONNECT_TIMEOUT_MS = 5000
const QUEUE_ADD_TIMEOUT_MS = 5000

function createBullRedisClient(type: 'client' | 'subscriber' | 'bclient'): Redis {
  const opts = {
    connectTimeout: BULL_CONNECT_TIMEOUT_MS,
    retryStrategy: (times: number) => (times > 5 ? null : Math.min(times * 200, 2000)),
    ...(type !== 'client' && {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    }),
  }
  console.log(`[EmailQueue:${type}] options:`, {
    maxRetriesPerRequest: opts.maxRetriesPerRequest,
    enableReadyCheck: opts.enableReadyCheck,
  })
  const client = new Redis(config.redis.url, opts)
  client.on('error', (err) => {
    console.error(`[EmailQueue:${type}] connection error:`, err.message)
  })
  return client
}

// function createBullRedisClient(type: 'client' | 'subscriber' | 'bclient'): Redis {
//   const client = new Redis(config.redis.url, {
//     connectTimeout: BULL_CONNECT_TIMEOUT_MS,
//     retryStrategy: (times) => (times > 5 ? null : Math.min(times * 200, 2000)),
//   })
//   client.on('error', (err) => {
//     console.error(`[EmailQueue:${type}] connection error:`, err.message)
//   })
//   return client
// }

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`[Timeout] ${label} exceeded ${ms}ms`)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer!)
  }
}

type EmailJob = {
  to: string
  subject: string
  html: string
  text: string
}

const emailQueue = new Bull<EmailJob>(config.queue.emailQueue, {
  createClient: (type) => createBullRedisClient(type),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
})

emailQueue.process(async (job) => {
  await transporter.sendMail({
    from: `Artsony <${config.email.from}>`,
    to: job.data.to,
    subject: job.data.subject,
    html: job.data.html,
    text: job.data.text,
  })
})

emailQueue.on('error', (err) => {
  console.error('[EmailQueue] queue-level error:', err.message)
})

emailQueue.on('failed', (job, err) => {
  console.error(`[EmailQueue] Job ${job.id} failed after ${job.attemptsMade} attempts:`, err.message)
})

// Every caller goes through this instead of emailQueue.add() directly, so no
// email send can ever hang the request that triggered it. A timeout here is
// logged and swallowed as a queueing failure — the caller decides whether
// that should fail the overall operation (see forgotPassword's try/catch).
async function enqueue(job: EmailJob): Promise<void> {
  await withTimeout(emailQueue.add(job), QUEUE_ADD_TIMEOUT_MS, `emailQueue.add(${job.subject})`)
}

// ─── Templates ────────────────────────────────────────────────────────────────

function baseTemplate(content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Artsony</title>
</head>
<body style="margin:0;padding:0;background:#FAFAFA;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E6E8EB;">
          <tr>
            <td style="background:#F25B38;padding:24px 32px;">
              <span style="color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Artsony</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #E6E8EB;">
              <p style="margin:0;font-size:12px;color:#788191;">
                You received this email because an action was taken on your Artsony account.
                If you didn't request this, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ─── Public interface ─────────────────────────────────────────────────────────

export const emailService = {
  async sendPasswordResetEmail(input: {
    to: string
    resetUrl: string
    expiryMinutes: number
  }): Promise<void> {
    const html = baseTemplate(`
      <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#25282D;">Reset your password</h2>
      <p style="margin:0 0 24px;font-size:15px;color:#525965;line-height:1.6;">
        We received a request to reset your password. Click the button below to choose a new one.
        This link is valid for <strong>${input.expiryMinutes} minutes</strong> and can only be used once.
      </p>
      <a href="${input.resetUrl}"
         style="display:inline-block;background:#F25B38;color:#fff;font-weight:600;font-size:15px;
                padding:14px 32px;border-radius:999px;text-decoration:none;">
        Reset Password
      </a>
      <p style="margin:24px 0 0;font-size:13px;color:#788191;">
        Or copy this link: <br/>
        <a href="${input.resetUrl}" style="color:#F25B38;word-break:break-all;">${input.resetUrl}</a>
      </p>
    `)

    await enqueue({
      to: input.to,
      subject: 'Reset your Artsony password',
      html,
      text: `Reset your password: ${input.resetUrl} (expires in ${input.expiryMinutes} minutes)`,
    })
  },

  async sendWelcomeEmail(input: { to: string; displayName: string }): Promise<void> {
    const html = baseTemplate(`
      <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#25282D;">
        Welcome to Artsony, ${input.displayName}! 🎨
      </h2>
      <p style="margin:0 0 24px;font-size:15px;color:#525965;line-height:1.6;">
        Your account is ready. Start by selecting your interests so we can personalise
        your feed with art you'll love.
      </p>
      <a href="${config.app.frontendUrl}/onboarding"
         style="display:inline-block;background:#F25B38;color:#fff;font-weight:600;font-size:15px;
                padding:14px 32px;border-radius:999px;text-decoration:none;">
        Set Up Your Profile
      </a>
    `)

    await enqueue({
      to: input.to,
      subject: "Welcome to Artsony — let's get started",
      html,
      text: `Welcome to Artsony! Visit ${config.app.frontendUrl}/onboarding to set up your profile.`,
    })
  },

  async sendEmailVerification(input: { to: string; verifyUrl: string }): Promise<void> {
    const html = baseTemplate(`
      <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#25282D;">Verify your email</h2>
      <p style="margin:0 0 24px;font-size:15px;color:#525965;line-height:1.6;">
        Click the button below to verify your email address and activate your account.
        This link expires in 24 hours.
      </p>
      <a href="${input.verifyUrl}"
         style="display:inline-block;background:#F25B38;color:#fff;font-weight:600;font-size:15px;
                padding:14px 32px;border-radius:999px;text-decoration:none;">
        Verify Email
      </a>
    `)

    await enqueue({
      to: input.to,
      subject: 'Verify your Artsony email address',
      html,
      text: `Verify your email: ${input.verifyUrl}`,
    })
  },

  async sendOrderConfirmation(input: {
    to: string
    orderId: string
    items: Array<{
      artwork_title:         string
      artwork_thumbnail_url: string | null
      artwork_format:        string
      unit_price:            number
      currency:              string
      quantity:              number
    }>
    total: number
    currency: string
  }): Promise<void> {
    const shortId = input.orderId.slice(0, 8).toUpperCase()

    const itemRows = input.items.map(item => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #E6E8EB;">
          <span style="font-size:14px;font-weight:600;color:#25282D;">${item.artwork_title}</span>
          <span style="display:block;font-size:12px;color:#788191;margin-top:2px;">
            ${item.artwork_format} &nbsp;·&nbsp; Qty ${item.quantity}
          </span>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #E6E8EB;text-align:right;font-size:14px;color:#25282D;font-weight:600;">
          ${item.currency} ${(item.unit_price * item.quantity).toFixed(2)}
        </td>
      </tr>
    `).join('')

    const html = baseTemplate(`
      <h2 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#25282D;">Order confirmed</h2>
      <p style="margin:0 0 24px;font-size:14px;color:#788191;">Order #${shortId}</p>
      <p style="margin:0 0 16px;font-size:15px;color:#525965;line-height:1.6;">
        Your payment is being verified on-chain. You'll receive another email once it's confirmed
        and your items are ready.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
        <thead>
          <tr>
            <th style="text-align:left;font-size:12px;color:#788191;font-weight:500;padding-bottom:8px;border-bottom:2px solid #E6E8EB;">ITEM</th>
            <th style="text-align:right;font-size:12px;color:#788191;font-weight:500;padding-bottom:8px;border-bottom:2px solid #E6E8EB;">AMOUNT</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
        <tfoot>
          <tr>
            <td style="padding-top:12px;font-size:15px;font-weight:700;color:#25282D;">Total</td>
            <td style="padding-top:12px;font-size:15px;font-weight:700;color:#25282D;text-align:right;">
              ${input.currency} ${input.total.toFixed(2)}
            </td>
          </tr>
        </tfoot>
      </table>
      <a href="${config.app.frontendUrl}/orders/${input.orderId}"
         style="display:inline-block;background:#F25B38;color:#fff;font-weight:600;font-size:15px;
                padding:14px 32px;border-radius:999px;text-decoration:none;margin-top:8px;">
        View Order
      </a>
    `)

    await enqueue({
      to:      input.to,
      subject: `Order confirmed — #${shortId}`,
      html,
      text:    `Your Artsony order #${shortId} has been received. Total: ${input.currency} ${input.total.toFixed(2)}. Track it at ${config.app.frontendUrl}/orders/${input.orderId}`,
    })
  },

  async sendOrderShippedEmail(input: {
    to: string
    orderId: string
    artworkTitle: string
  }): Promise<void> {
    const shortId = input.orderId.slice(0, 8).toUpperCase()

    const html = baseTemplate(`
      <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#25282D;">Your order is on its way</h2>
      <p style="margin:0 0 24px;font-size:15px;color:#525965;line-height:1.6;">
        Good news — <strong>${input.artworkTitle}</strong> has been shipped by the seller.
        Order reference: <strong>#${shortId}</strong>
      </p>
      <a href="${config.app.frontendUrl}/orders/${input.orderId}"
         style="display:inline-block;background:#F25B38;color:#fff;font-weight:600;font-size:15px;
                padding:14px 32px;border-radius:999px;text-decoration:none;">
        Track Order
      </a>
    `)

    await enqueue({
      to:      input.to,
      subject: `Your Artsony order #${shortId} has shipped`,
      html,
      text: `Your order #${shortId} (${input.artworkTitle}) has been shipped. View it at ${config.app.frontendUrl}/orders/${input.orderId}`,
    })
  },

  async sendAccountDeletionConfirmation(input: {
    to: string
    displayName: string
    scheduledAt: Date
  }): Promise<void> {
    const dateStr = input.scheduledAt.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })

    const html = baseTemplate(`
      <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#25282D;">
        Account deletion scheduled
      </h2>
      <p style="margin:0 0 16px;font-size:15px;color:#525965;line-height:1.6;">
        Hi ${input.displayName}, your account has been scheduled for permanent deletion on
        <strong>${dateStr}</strong>. Until then your account is deactivated and your data is preserved.
      </p>
      <p style="margin:0 0 24px;font-size:15px;color:#525965;line-height:1.6;">
        If you change your mind, contact support before that date to restore your account.
      </p>
      <a href="${config.app.frontendUrl}/support"
         style="display:inline-block;background:#2F333A;color:#fff;font-weight:600;font-size:15px;
                padding:14px 32px;border-radius:999px;text-decoration:none;">
        Contact Support
      </a>
    `)

    await enqueue({
      to: input.to,
      subject: 'Your Artsony account has been scheduled for deletion',
      html,
      text: `Your account is scheduled for deletion on ${dateStr}. Contact support to cancel.`,
    })
  },
}