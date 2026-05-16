import nodemailer from 'nodemailer'
import Bull from 'bull'
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

type EmailJob = {
  to: string
  subject: string
  html: string
  text: string
}

const emailQueue = new Bull<EmailJob>(config.queue.emailQueue, {
  redis: config.redis.url,
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

emailQueue.on('failed', (job, err) => {
  console.error(`[EmailQueue] Job ${job.id} failed after ${job.attemptsMade} attempts:`, err.message)
})

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

    await emailQueue.add({
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
      <a href="${config.app.frontendUrl}/auth/interests"
         style="display:inline-block;background:#F25B38;color:#fff;font-weight:600;font-size:15px;
                padding:14px 32px;border-radius:999px;text-decoration:none;">
        Set Up Your Profile
      </a>
    `)

    await emailQueue.add({
      to: input.to,
      subject: "Welcome to Artsony — let's get started",
      html,
      text: `Welcome to Artsony! Visit ${config.app.frontendUrl}/auth/interests to set up your profile.`,
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

    await emailQueue.add({
      to: input.to,
      subject: 'Verify your Artsony email address',
      html,
      text: `Verify your email: ${input.verifyUrl}`,
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

    await emailQueue.add({
      to: input.to,
      subject: 'Your Artsony account has been scheduled for deletion',
      html,
      text: `Your account is scheduled for deletion on ${dateStr}. Contact support to cancel.`,
    })
  },
}
