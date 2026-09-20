import { describe, it, expect } from 'vitest';
import { formatTelegramMessage, formatDiscordEmbed, dispatchAlert } from '../alertDispatcher';

describe('Value Bet Alert Dispatcher', () => {
  const mockAlert = {
    matchName: 'Arsenal vs Chelsea',
    league: 'Premier League',
    matchDate: '2026-09-12 17:30',
    market: 'Under 2.5 Goluri',
    bookmakerOdd: 2.10,
    fairOdd: 1.85,
    edgePercent: 13.51,
    clvProjectionPercent: 8.2,
    kellyStakeUnits: 2.04,
    confidenceScore: 0.88,
  };

  it('formats clean Telegram HTML messages with key betting metrics', () => {
    const msg = formatTelegramMessage(mockAlert);

    expect(msg).toContain('FLASHTAT VALUE BET DETECTED');
    expect(msg).toContain('Arsenal vs Chelsea');
    expect(msg).toContain('Under 2.5 Goluri');
    expect(msg).toContain('+13.51%');
    expect(msg).toContain('2.04u');
  });

  it('formats Discord Embed payloads with green color and proper fields', () => {
    const embed = formatDiscordEmbed(mockAlert);

    expect(embed.title).toContain('Arsenal vs Chelsea');
    expect(embed.color).toBe(0x10b981);
    expect(embed.fields.length).toBe(6);
    expect(embed.fields[0].value).toBe('Under 2.5 Goluri');
  });

  it('handles alert dispatch safely without external network calls when URL not provided', async () => {
    const res = await dispatchAlert(mockAlert);
    expect(res.success).toBe(true);
    expect(res.formattedMessage.length).toBeGreaterThan(50);
  });
});
