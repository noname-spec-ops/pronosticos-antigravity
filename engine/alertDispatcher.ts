/**
 * FlashStat - Real-time Value Bet Alert Dispatcher (engine/alertDispatcher.ts)
 * 
 * Formats and dispatches institutional value bet notifications
 * to Discord, Telegram, or custom webhooks.
 */

export interface ValueBetAlertItem {
  matchName: string;
  league: string;
  matchDate: string;
  market: string;
  bookmakerOdd: number;
  fairOdd: number;
  edgePercent: number;
  clvProjectionPercent: number;
  kellyStakeUnits: number;
  confidenceScore: number;
}

export interface WebhookPayload {
  platform: 'telegram' | 'discord' | 'generic';
  text: string;
  embed?: Record<string, any>;
}

/**
 * Formats a Telegram HTML/Markdown notification message
 */
export function formatTelegramMessage(item: ValueBetAlertItem): string {
  return [
    `🎯 <b>FLASHTAT VALUE BET DETECTED</b>`,
    `⚽ <b>${item.matchName}</b> (${item.league})`,
    `📅 Data: ${item.matchDate}`,
    ``,
    `🔥 <b>Pariu:</b> ${item.market}`,
    `📈 <b>Cota Luată:</b> ${item.bookmakerOdd.toFixed(2)} (Fair: ${item.fairOdd.toFixed(2)})`,
    `✨ <b>Edge AI:</b> +${item.edgePercent.toFixed(2)}% | <b>CLV Est.:</b> +${item.clvProjectionPercent.toFixed(2)}%`,
    `💰 <b>Miză Recomandată (Kelly):</b> ${item.kellyStakeUnits.toFixed(2)}u`,
    `🛡️ <b>Scor Încredere:</b> ${(item.confidenceScore * 100).toFixed(0)}%`,
    ``,
    `<i>⚡ Sistemul FlashStat OP GODMODE | Zero Lookahead</i>`
  ].join('\n');
}

/**
 * Formats a Discord Embed payload
 */
export function formatDiscordEmbed(item: ValueBetAlertItem): Record<string, any> {
  return {
    title: `🎯 VALUE BET: ${item.matchName}`,
    description: `**Ligă:** ${item.league} | **Data:** ${item.matchDate}`,
    color: 0x10b981, // Emerald green
    fields: [
      { name: 'Pariu Selectat', value: item.market, inline: true },
      { name: 'Cotă Bookmaker', value: `${item.bookmakerOdd.toFixed(2)}`, inline: true },
      { name: 'Cotă Fair AI', value: `${item.fairOdd.toFixed(2)}`, inline: true },
      { name: 'Edge Matematic', value: `+${item.edgePercent.toFixed(2)}%`, inline: true },
      { name: 'CLV Estimat', value: `+${item.clvProjectionPercent.toFixed(2)}%`, inline: true },
      { name: 'Miză Kelly', value: `${item.kellyStakeUnits.toFixed(2)}u`, inline: true },
    ],
    footer: { text: `FlashStat OP GODMODE • Scor Încredere: ${(item.confidenceScore * 100).toFixed(0)}%` },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Dispatches an alert to an optional Webhook URL or logs the formatted payload
 */
export async function dispatchAlert(
  item: ValueBetAlertItem,
  webhookUrl?: string
): Promise<{ success: boolean; formattedMessage: string }> {
  const tgMsg = formatTelegramMessage(item);

  if (webhookUrl && webhookUrl.startsWith('http')) {
    try {
      const isDiscord = webhookUrl.includes('discord.com');
      const body = isDiscord 
        ? JSON.stringify({ embeds: [formatDiscordEmbed(item)] })
        : JSON.stringify({ text: tgMsg, parse_mode: 'HTML' });

      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      return { success: true, formattedMessage: tgMsg };
    } catch (e: any) {
      return { success: false, formattedMessage: tgMsg };
    }
  }

  return { success: true, formattedMessage: tgMsg };
}
