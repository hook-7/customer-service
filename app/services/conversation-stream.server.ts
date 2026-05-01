type SerializedMessage = {
  id: string;
  sender: string;
  kind: string;
  body: string;
  metadata: unknown;
  clientMessageId: string | null;
  createdAt: string;
};

type AiReply = {
  replyText: string;
  recommendedProductIds: string[];
  recommendationReasons?: Record<string, string>;
};

type StreamResult = {
  reply: AiReply | null;
  error?: string;
};

type CreateConversationStreamArgs = {
  conversationId: string;
  aiEnabled: boolean;
  ack: SerializedMessage;
  shop: string;
  visitorId: string;
  text: string;
  clientMessageId: string;
  buildProductContext: () => Promise<string>;
  streamCustomerService: (args: {
    shop: string;
    visitorId: string;
    message: string;
    productContext: string;
    onText: (text: string) => Promise<void> | void;
  }) => Promise<StreamResult>;
  appendAiReply: (args: {
    conversationId: string;
    shop: string;
    requestClientMessageId: string;
    reply: AiReply | null;
    error?: string;
  }) => Promise<SerializedMessage[]>;
  listMessages: () => Promise<SerializedMessage[]>;
  fallbackMessage: (error?: string) => string;
};

function ndjson(data: unknown) {
  return `${JSON.stringify(data)}\n`;
}

export function createConversationStream(args: CreateConversationStreamArgs) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => controller.enqueue(encoder.encode(ndjson(data)));

      try {
        send({
          type: "ack",
          ok: true,
          conversationId: args.conversationId,
          aiEnabled: args.aiEnabled,
          message: args.ack,
        });

        if (args.aiEnabled) {
          let streamedAnyText = false;
          const result = await args.streamCustomerService({
            shop: args.shop,
            visitorId: args.visitorId,
            message: args.text,
            productContext: await args.buildProductContext(),
            onText: (delta) => {
              streamedAnyText = true;
              send({ type: "assistant_delta", text: delta });
            },
          });
          if (!result.reply && !streamedAnyText) {
            send({ type: "assistant_delta", text: args.fallbackMessage(result.error) });
          }
          const assistantMessages = await args.appendAiReply({
            conversationId: args.conversationId,
            shop: args.shop,
            requestClientMessageId: args.clientMessageId,
            reply: result.reply,
            error: result.error,
          });
          send({
            type: "assistant_done",
            ok: Boolean(result.reply),
            messages: assistantMessages,
          });
        }

        send({
          type: "done",
          ok: true,
          conversationId: args.conversationId,
          aiEnabled: args.aiEnabled,
          messages: await args.listMessages(),
        });
      } catch (error) {
        const assistantMessages = await args.appendAiReply({
          conversationId: args.conversationId,
          shop: args.shop,
          requestClientMessageId: args.clientMessageId,
          reply: null,
          error: error instanceof Error ? error.message : String(error),
        });
        send({
          type: "assistant_done",
          ok: false,
          messages: assistantMessages,
        });
        send({
          type: "done",
          ok: false,
          conversationId: args.conversationId,
          aiEnabled: args.aiEnabled,
          messages: await args.listMessages(),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
