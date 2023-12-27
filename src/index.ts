// 必要なパッケージをインポートする
import { Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import dotenv from 'dotenv';
import { onVoiceCreateInteraction } from './guildProcess/voiceCreateInteraction.js';
import { onVoiceStateUpdate } from './guildProcess/voiceCreate.js';

// .envファイルを読み込む
dotenv.config();

// Botで使うGetwayIntents、partials
const client: Client = new Client({
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

// Discordにログインする
await client.login(process.env.KokoneToken);
