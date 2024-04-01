import {
  EmbedBuilder,
  GuildMember,
  OverwriteResolvable,
  PermissionsBitField,
  User,
  UserSelectMenuInteraction,
  VoiceBasedChannel,
} from 'discord.js';

import { config } from './utils/config.js';
import {
  prisma,
  getConnectedEditableChannel,
  editChannelPermission,
  MenuInteraction,
} from './voiceController.js';

import { client } from './index.js';

/**
 * ボイスチャンネルを使用するユーザーの権限
 */
export const allowUserPermisson: bigint[] = [
  PermissionsBitField.Flags.ViewChannel, // チャンネルを見る
];

/**
 * ボイスチャンネルを作成したユーザーの追加管理権限
 */
export const allowCreateUserPermisson: bigint[] = [
  PermissionsBitField.Flags.PrioritySpeaker, // 優先スピーカー
  PermissionsBitField.Flags.Connect, // 接続
];

/**
 * ボイスチャンネルを使用させなくさせるための権限
 */
export const denyUserPermisson: bigint[] = [
  PermissionsBitField.Flags.ViewChannel, // チャンネルを見る
];

/**
 * ブロックしているユーザーを表示する際の埋め込みメッセージ
 */
const showBlackListEmbed: EmbedBuilder = new EmbedBuilder()
  .setColor(parseInt(config.botColor.replace('#', ''), 16))
  .setTitle('ブロックしているユーザー');

/**
 * ブロックする
 * @param interaction インタラクション
 */
export async function addUserToBlackList(
  interaction: UserSelectMenuInteraction,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const member = interaction.guild?.members.cache.get(interaction.user.id);
  if (!member) return;
  const selectedMemberNum = interaction.values.length;

  // 選択されたユーザーを取得する
  const selectedUserIds = interaction.values;

  // ブロックしたユーザーを取得
  const { privilegedUsers, alreadyBlockedUsers } = await blockUsers(
    member,
    selectedUserIds,
  );

  // チャンネルの権限を更新
  const channel = await getConnectedEditableChannel(interaction).catch(
    () => {},
  );
  if (channel) {
    await editChannelPermission(channel, interaction.user);
  }

  // リプライを送信
  const blockedUserNum =
    selectedMemberNum - privilegedUsers.length - alreadyBlockedUsers.length;
  let replyMessage = `選択した${selectedMemberNum}人${
    selectedMemberNum === blockedUserNum ? '' : `の内${blockedUserNum}人`
  }のユーザーのブロックが完了しました。\n`;
  if (privilegedUsers.length > 0) {
    const errorUsersString = privilegedUsers
      .map((userId) => `<@${userId}>`)
      .join(', ');
    replyMessage += `${errorUsersString} はブロックできませんでした。\n`;
  }
  if (alreadyBlockedUsers.length > 0) {
    const errorUsersString = alreadyBlockedUsers
      .map((userId) => `<@${userId}>`)
      .join(', ');
    replyMessage += `${errorUsersString} は既にブロックされているためブロックできませんでした。\n`;
  }
  await interaction.editReply({
    content: replyMessage,
  });
}

/**
 * ブロック処理
 * @param ownerMember VCを作成したユーザー
 * @param selectedUserIds ブロックするユーザーのID
 * @returns 特権があるユーザー、既にブロックされているユーザー
 */
export async function blockUsers(
  ownerMember: GuildMember,
  selectedUserIds: string[],
): Promise<{
  privilegedUsers: string[];
  alreadyBlockedUsers: string[];
}> {
  const blockedUsers = await prisma.blackLists.findMany({
    where: {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      user_id: String(ownerMember.user.id),
    },
  });

  // ブロック処理
  const alreadyBlockedUsers: string[] = [];
  const privilegedUsers: string[] = [];
  for (const selectedUserId of selectedUserIds) {
    // Prismaを使ってBlackListsテーブルにレコードを作成
    if (
      blockedUsers.find((user) => String(user.block_user_id) === selectedUserId)
    ) {
      alreadyBlockedUsers.push(selectedUserId);
    } else if (await validatePrivilegedUser(ownerMember, selectedUserId)) {
      privilegedUsers.push(selectedUserId);
    } else {
      await prisma.blackLists.create({
        data: {
          /* eslint-disable @typescript-eslint/naming-convention */
          user_id: ownerMember.id,
          block_user_id: String(selectedUserId),
          /* eslint-enable @typescript-eslint/naming-convention */
        },
      });
    }
  }

  return { privilegedUsers, alreadyBlockedUsers };
}

/**
 * ブロック解除
 * @param interaction インタラクション
 */
export async function removeUserFromBlackList(
  interaction: UserSelectMenuInteraction,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  // ブロックしたユーザーを取得
  const userId: string = String(interaction.user.id);
  const blockedUsers = await prisma.blackLists.findMany({
    where: {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      user_id: String(interaction.user.id),
    },
  });
  // ブロック解除処理
  for (let i = 0; i < interaction.values.length; i++) {
    const blockUserId: string = String(interaction.values[i]);
    for (let i = 0; i < blockedUsers.length; i++) {
      if (String(blockedUsers[i].block_user_id) === blockUserId) {
        await prisma.blackLists.deleteMany({
          where: {
            /* eslint-disable @typescript-eslint/naming-convention */
            user_id: String(userId),
            block_user_id: String(blockUserId),
            /* eslint-enable @typescript-eslint/naming-convention */
          },
        });
      }
    }
  }

  // チャンネルの権限を更新
  const channel = await getConnectedEditableChannel(interaction).catch(
    () => {},
  );
  if (channel) {
    await editChannelPermission(channel, interaction.user);
  }

  // リプライを送信
  await interaction.editReply({
    content: '選択したユーザーのブロック解除が完了しました',
  });
}

/**
 * ブロックするユーザーの特権チェックを行う。
 * @param ownerMember VCを作成したユーザー
 * @param blockUserId ブロックするユーザーのID
 * @returns 特権があればtrue、なければfalse
 */
async function validatePrivilegedUser(
  ownerMember: GuildMember,
  blockUserId: string,
): Promise<boolean> {
  // 自身のIDを取得
  const userId: string = ownerMember.id;
  // メンバーを取得
  const member = await ownerMember.guild.members.fetch(blockUserId);
  // ブロックするユーザーが自分自身か、ブロックするユーザーがVC移動権限を持っているか確認
  return (
    blockUserId === userId ||
    member?.permissions.has(PermissionsBitField.Flags.MoveMembers) === true
  );
}

/**
 * ブロックしているユーザーがいた場合、チャンネルを表示しない
 * @param ownerUser ユーザー
 * @returns ブロックされているユーザーの権限
 */
export async function getDenyOverwrites(
  ownerUser: User,
): Promise<OverwriteResolvable[]> {
  const overwrites: OverwriteResolvable[] = [];

  // ブロックしているユーザーを取得
  const allUsers = await prisma.blackLists.findMany({
    where: {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      user_id: String(ownerUser.id),
    },
  });

  for (const user of allUsers) {
    // ユーザーをフェッチしないと内部でresolveに失敗してエラーが出る
    const blockUser = await client.users.fetch(user.block_user_id);
    if (blockUser) {
      overwrites.push({
        id: blockUser,
        deny: [denyUserPermisson],
      });
    }
  }

  return overwrites;
}

/**
 * チャンネルのカテゴリのBot自身の権限を取得
 * @param channel チャンネル
 * @returns 権限
 */
export function getOwnCategoryPermission(
  channel: VoiceBasedChannel,
): OverwriteResolvable[] {
  const me = channel.guild.members.me;
  if (!channel.parent || !me) return [];

  // カテゴリの上書き権限を取得
  return [...channel.parent.permissionOverwrites.cache.values()].filter(
    (permission) =>
      me.id === permission.id || me.roles.cache.has(permission.id),
  );
}

/**
 * ブロックしているユーザーを確認
 * @param interaction インタラクション
 * @param user ユーザー
 */
export async function showBlackList(
  interaction: MenuInteraction,
  user: User,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const allUsers = await prisma.blackLists.findMany({
    where: {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      user_id: String(user.id),
    },
  });

  // ブロックしているユーザーリストの文字列を作成
  const blockUserList: string =
    allUsers.length > 0
      ? allUsers.map((user) => `<@${user.block_user_id}>`).join('\n')
      : 'なし';

  // リプライを送信
  await interaction.editReply({
    embeds: [
      showBlackListEmbed.setDescription(blockUserList).setAuthor({
        name: user.username,
        iconURL: user.avatarURL() ?? undefined,
      }),
    ],
  });
}
