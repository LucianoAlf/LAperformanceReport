const DEFAULT_REPORT_MAX_MESSAGE_LENGTH = 16_000;


function normalizeWhatsAppId(value) {
  return String(value || '').trim().replace(/:.*@/, '@');
}


function isGroupChatId(chatId) {
  return String(chatId || '').endsWith('@g.us');
}


function isOwnChatId(chatId, sock) {
  const normalized = normalizeWhatsAppId(chatId);
  const ownIds = new Set(
    [sock?.user?.id, sock?.user?.lid]
      .map(normalizeWhatsAppId)
      .filter(Boolean),
  );
  return ownIds.has(normalized);
}


export function registerReportSingleMessageRoute({
  app,
  getSocket,
  getConnectionState,
  formatOutgoingMessage,
  sendWithTimeout,
  trackSentMessageId,
  isAllowedGroupChatId,
  maxMessageLength = Number.parseInt(
    process.env.WHATSAPP_REPORT_MAX_MESSAGE_LENGTH ||
      String(DEFAULT_REPORT_MAX_MESSAGE_LENGTH),
    10,
  ),
}) {
  app.post('/send-report', async (req, res) => {
    const sock = getSocket();
    if (!sock || getConnectionState() !== 'connected') {
      return res.status(503).json({ error: 'not_connected_to_whatsapp' });
    }

    const { chatId, message } = req.body || {};
    if (
      typeof chatId !== 'string' ||
      !chatId.trim() ||
      typeof message !== 'string' ||
      !message.trim()
    ) {
      return res.status(400).json({ error: 'chatId_and_message_required' });
    }

    const formatted = String(formatOutgoingMessage(message));
    if (
      !Number.isFinite(maxMessageLength) ||
      maxMessageLength < 1 ||
      formatted.length > maxMessageLength
    ) {
      return res.status(413).json({
        error: 'report_too_long',
        maxLength: maxMessageLength,
      });
    }

    const allowed = isGroupChatId(chatId)
      ? isAllowedGroupChatId(chatId)
      : isOwnChatId(chatId, sock);
    if (!allowed) {
      return res.status(403).json({ error: 'report_destination_not_allowed' });
    }

    try {
      const sent = await sendWithTimeout(chatId, { text: formatted });
      trackSentMessageId(sent);
      const messageId = sent?.key?.id;
      if (!messageId) {
        throw new Error('message_id_missing');
      }
      return res.json({
        success: true,
        singleMessage: true,
        messageId,
        messageIds: [messageId],
      });
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
