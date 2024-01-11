// 必要なパッケージをインポートする
import { Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import dotenv from 'dotenv';
import { onVoiceCreateInteraction } from './voiceInteractionHandler.js';
import { onVoiceStateUpdate } from './voiceStateHandler.js';
import { logger } from './utils/log.js';
import { updateControlPanel } from './voiceController.js';

// .envファイルを読み込む
dotenv.config();

/**
 * Discord Client
 */
export const client: Client = new Client({
  // Botで使うGetwayIntents、partials
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Message, Partials.Channel],
});

// -----------------------------------------------------------------------------------------------------------
// イベントハンドラーを登録する
// -----------------------------------------------------------------------------------------------------------
client.on(Events.InteractionCreate, onVoiceCreateInteraction);
client.on(Events.VoiceStateUpdate, onVoiceStateUpdate);
client.on(Events.ClientReady, async () => {
  logger.info(`${client.user?.username ?? 'Unknown'} として起動しました!`);

  // VC操作パネルのメッセージを投稿する
  await updateControlPanel();
});

// Discordにログインする
await client.login(process.env.DISCORD_TOKEN);
