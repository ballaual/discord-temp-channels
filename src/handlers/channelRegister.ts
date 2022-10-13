import {
  Collection,
  VoiceChannel,
  Snowflake,
  TextChannel,
  ChannelType,
  OverwriteType,
} from 'discord.js';
import { TempChannelsManager } from '../TempChannelsManager';
import { TempChannelsManagerEvents } from '../TempChannelsManagerEvents';
import { ChildChannelData, ParentChannelData } from '../types';

export const handleRegistering = async (
  manager: TempChannelsManager,
  parent: ParentChannelData
) => {
  if (!manager || !parent) return;

  const parentChannel = manager.client.channels.resolve(
    parent.channelId
  ) as VoiceChannel;

  // reconstruct parent's children array when bot is ready
  if (parentChannel && parent.options.childVoiceFormatRegex) {
    let textChildren = new Collection<Snowflake, TextChannel>();
    const voiceChildren = parentChannel.parent.children.cache.filter(
      (c) => parent.options.childVoiceFormatRegex.test(c.name) && c.type === ChannelType.GuildVoice && c.permissionOverwrites.cache.some((po) => po.type === OverwriteType.Member)
    );
    if (parent.options.childTextFormatRegex) {
      textChildren = parentChannel.parent.children.cache.filter(
        (c) => parent.options.childTextFormatRegex.test(c.name) && c.type === ChannelType.GuildText && c.permissionOverwrites.cache.some((po) => po.type === OverwriteType.Member)
      ) as Collection<Snowflake, TextChannel>;
    }

    parent.children = await Promise.all(
      voiceChildren.map(async (child) => {
        const ownerId = child.permissionOverwrites.cache.find((po) => po.type === OverwriteType.Member).id;
        const owner = await child.guild.members.fetch(ownerId);

        const channelData: ChildChannelData = {
          owner,
          voiceChannel: child as VoiceChannel,
          textChannel: textChildren.find((c) => c.permissionOverwrites.cache.some((po) => po.type === OverwriteType.Member && po.id === ownerId)),
        };
        return channelData;
      })
    );

    // remove children if voice channels are empty when bot is ready
    parent.children = Array.from(
      new Collection(parent.children.map((c) => [c.owner.id, c]))
        .each(async (child) => {
          const childShouldBeDeleted =
            (parent.options.childAutoDeleteIfEmpty &&
              child.voiceChannel.members.size === 0) ||
            (parent.options.childAutoDeleteIfOwnerLeaves &&
              !child.voiceChannel.members.has(child.owner.id));
          if (childShouldBeDeleted) {
            if (child.textChannel) {
              await child.textChannel.delete();
              manager.emit(
                TempChannelsManagerEvents.textChannelDelete,
                child.textChannel
              );
            }

            await child.voiceChannel.delete();
            manager.emit(
              TempChannelsManagerEvents.voiceChannelDelete,
              child.voiceChannel
            );

            manager.emit(
              TempChannelsManagerEvents.childDelete,
              manager.client.user,
              child,
              parentChannel
            );
          }
        })
        .filter((c) => c.voiceChannel.deletable)
        .values()
    );
  }
};
