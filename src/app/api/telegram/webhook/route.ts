import { NextRequest, NextResponse } from 'next/server';
import { handleCommand } from '../../../../lib/telegram-commands';

// ==========================================
// Telegram Webhook
//
// Telegram sends a POST here for every message sent to the bot.
//
// Setup (run once):
//   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-app.vercel.app/api/telegram/webhook"
//
// Security: Telegram sends the bot token in the URL path, but
// since we use a secret token in the header we validate that instead.
// If TELEGRAM_WEBHOOK_SECRET is set, Telegram must send it via
// X-Telegram-Bot-Api-Secret-Token header (configured in setWebhook).
// ==========================================

export const dynamic = 'force-dynamic';

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; username?: string; first_name?: string };
    chat: { id: number; type: string };
    text?: string;
    date: number;
  };
}

export async function POST(request: NextRequest) {
  // Optional webhook secret validation
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (webhookSecret) {
    const incomingSecret = request.headers.get(
      'x-telegram-bot-api-secret-token',
    );
    if (incomingSecret !== webhookSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let update: TelegramUpdate;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const message = update.message;

  // Only handle text messages
  if (!message?.text) {
    return NextResponse.json({ ok: true });
  }

  const chatId = message.chat.id;
  const text = message.text.trim();

  // Only handle commands (start with /)
  if (!text.startsWith('/')) {
    return NextResponse.json({ ok: true });
  }

  // Parse command (strip @botname suffix if present)
  const [rawCommand, ...args] = text.split(' ');
  const command = rawCommand!.split('@')[0]!.toLowerCase();

  // Handle in background — respond 200 to Telegram immediately
  handleCommand(command, args, chatId).catch((err) =>
    console.error('[TelegramWebhook] Command error:', err),
  );

  return NextResponse.json({ ok: true });
}
