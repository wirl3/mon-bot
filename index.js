import 'dotenv/config';
import { createServer } from 'node:http';
import { Client, GatewayIntentBits, REST, Routes, Events, PermissionFlagsBits, AttachmentBuilder } from 'discord.js';
import { readFileSync } from 'node:fs';

const httpServer = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is alive!');
});
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`HTTP server running on port ${PORT}`));

const TOKEN = process.env.DISCORD_TOKEN;
const ROLE_MODERATEUR = '1538977207567913030';
const ROLE_VERIFIE = '1538978363681542204';
const ROLE_NON_VERIFIE = '1539096315907280996';
const CATEGORY_TICKETS = '1539075873729417246';
const LOGS_CHANNEL = '1539076460273344532';
const GUILD_ID = '1538977085282984017';

const ticketCreators = new Map();

if (!TOKEN || TOKEN === 'COLLE_TON_TOKEN_ICI') {
  console.error('Erreur : mets ton token dans le fichier .env');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const globalCommands = [];

const guildCommands = [
  {
    name: 'ban',
    description: 'Bannir définitivement un membre',
    default_member_permissions: PermissionFlagsBits.BanMembers.toString(),
    options: [
      {
        name: 'membre',
        description: 'Le membre à bannir',
        type: 6,
        required: true,
      },
      {
        name: 'raison',
        description: 'Raison du ban',
        type: 3,
        required: false,
      },
    ],
  },
  {
    name: 'meetup',
    description: 'Envoyer l\'embed meetup dans un salon',
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    options: [
      {
        name: 'salon',
        description: 'Salon où poster l\'embed (laisser vide = ici)',
        type: 7,
        required: false,
      },
    ],
  },
];

function hasModRole(interaction) {
  return interaction.member.roles.cache.has(ROLE_MODERATEUR);
}

client.once(Events.ClientReady, async (c) => {
  console.log(`Connecté en tant que ${c.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(c.user.id), { body: globalCommands });
    console.log('Commandes globales enregistrées');
    await rest.put(Routes.applicationGuildCommands(c.user.id, GUILD_ID), { body: guildCommands });
    console.log('Commandes serveur enregistrées');
  } catch (err) {
    console.error('Erreur lors de l\'enregistrement des commandes :', err);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {

  if (interaction.isButton()) {
    if (interaction.customId === 'confirm_rules' || interaction.customId === 'confirm_rules_fr') {
      if (!interaction.member.roles.cache.has(ROLE_NON_VERIFIE)) {
        return interaction.reply({ content: 'Tu es déjà vérifié / You are already verified.', ephemeral: true });
      }

      try {
        await interaction.member.roles.remove(ROLE_NON_VERIFIE);
        await interaction.member.roles.add(ROLE_VERIFIE);
        const msg = interaction.customId === 'confirm_rules_fr'
          ? '✅ Tu as accepté les règles. Bienvenue dans **6.3 Drivers** !'
          : '✅ You have accepted the rules. Welcome to **6.3 Drivers**!';
        await interaction.reply({ content: msg, ephemeral: true });
        console.log(`Vérification confirmée par ${interaction.user.username}`);
      } catch (err) {
        console.error(err);
        await interaction.reply({ content: '❌ Une erreur est survenue.', ephemeral: true });
      }
    }

    if (interaction.customId === 'meetup_participate') {
      return interaction.reply({ content: '📢 Rejoins le salon vocal à l\'heure indiquée pour le rasso !', ephemeral: true });
    }

    if (interaction.customId === 'meetup_participate_en') {
      return interaction.reply({ content: '📢 Join the voice channel at the scheduled time for the meetup!', ephemeral: true });
    }

    if (interaction.customId === 'open_ticket') {
      const guild = interaction.guild;
      const user = interaction.user;

      const existing = guild.channels.cache.find(
        ch => ch.name === `ticket-${user.username}` && ch.parentId === CATEGORY_TICKETS
      );
      if (existing) {
        return interaction.reply({ content: `❌ You already have an open ticket: ${existing}`, ephemeral: true });
      }

      try {
        const ticketChannel = await guild.channels.create({
          name: `ticket-${user.username}`,
          type: 0,
          parent: CATEGORY_TICKETS,
          permissionOverwrites: [
            { id: guild.id, allow: '0', deny: '1024' },
            { id: user.id, allow: '1024', deny: '0' },
            { id: ROLE_MODERATEUR, allow: '1024', deny: '0' },
          ],
        });

        const ticketEmbed = {
          title: '📩 Ticket — ' + user.username,
          description:
            'Bienvenue dans ton ticket.\n' +
            'Welcome to your ticket.\n\n' +
            'Décris ton problème et un membre du staff te répondra.\n' +
            'Describe your issue and a staff member will respond to you.\n\n' +
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
            'Pour fermer ce ticket, clique sur le bouton ci-dessous.',
          color: 0x000000,
          footer: { text: 'By 6.3' },
          timestamp: new Date().toISOString(),
        };

        const row1 = {
          type: 1,
          components: [
            {
              type: 2,
              style: 3,
              label: 'Claim',
              custom_id: 'claim_ticket_' + ticketChannel.id,
            },
            {
              type: 2,
              style: 4,
              label: 'Fermer / Close',
              custom_id: 'close_ticket_' + user.id,
            },
          ],
        };

        await ticketChannel.send({
          content: `<@${user.id}> <@1539624340491075604>`,
          embeds: [ticketEmbed],
          components: [row1],
        });

        ticketCreators.set(ticketChannel.id, user.id);

        await interaction.reply({ content: `✅ Ticket created: ${ticketChannel}`, ephemeral: true });
        console.log(`Ticket ouvert par ${user.username}`);
      } catch (err) {
        console.error(err);
        await interaction.reply({ content: '❌ Error creating ticket.', ephemeral: true });
      }
      return;
    }

    if (interaction.customId === 'ouvrir_ticket') {
      const guild = interaction.guild;
      const user = interaction.user;

      const existing = guild.channels.cache.find(
        ch => ch.name === `ticket-${user.username}` && ch.parentId === CATEGORY_TICKETS
      );
      if (existing) {
        return interaction.reply({ content: `❌ Tu as déjà un ticket ouvert : ${existing}`, ephemeral: true });
      }

      try {
        const ticketChannel = await guild.channels.create({
          name: `ticket-${user.username}`,
          type: 0,
          parent: CATEGORY_TICKETS,
          permissionOverwrites: [
            { id: guild.id, allow: '0', deny: '1024' },
            { id: user.id, allow: '1024', deny: '0' },
            { id: ROLE_MODERATEUR, allow: '1024', deny: '0' },
          ],
        });

        const ticketEmbed = {
          title: '📩 Ticket — ' + user.username,
          description:
            'Bienvenue dans ton ticket.\n' +
            'Welcome to your ticket.\n\n' +
            'Décris ton problème et un membre du staff te répondra.\n' +
            'Describe your issue and a staff member will respond to you.\n\n' +
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
            'Pour fermer ce ticket, clique sur le bouton ci-dessous.',
          color: 0x000000,
          footer: { text: 'By 6.3' },
          timestamp: new Date().toISOString(),
        };

        const row1 = {
          type: 1,
          components: [
            {
              type: 2,
              style: 3,
              label: 'Claim',
              custom_id: 'claim_ticket_' + ticketChannel.id,
            },
            {
              type: 2,
              style: 4,
              label: 'Fermer / Close',
              custom_id: 'close_ticket_' + user.id,
            },
          ],
        };

        await ticketChannel.send({
          content: `<@${user.id}> <@1539624340491075604>`,
          embeds: [ticketEmbed],
          components: [row1],
        });

        ticketCreators.set(ticketChannel.id, user.id);

        await interaction.reply({ content: `✅ Ticket créé : ${ticketChannel}`, ephemeral: true });
        console.log(`Ticket ouvert par ${user.username}`);
      } catch (err) {
        console.error(err);
        await interaction.reply({ content: '❌ Erreur lors de la création du ticket.', ephemeral: true });
      }
      return;
    }

    if (interaction.customId.startsWith('close_ticket_')) {
      const ticketUser = interaction.customId.replace('close_ticket_', '');
      if (interaction.user.id !== ticketUser && !hasModRole(interaction)) {
        return interaction.reply({ content: '❌ Tu ne peux pas fermer ce ticket.', ephemeral: true });
      }

      try {
        await interaction.reply({ content: '🔒 Ticket fermé. Transcription en cours...' });

        const creatorId = ticketCreators.get(interaction.channel.id);
        ticketCreators.delete(interaction.channel.id);

        const messages = [];
        let lastId;
        while (true) {
          const options = { limit: 100 };
          if (lastId) options.before = lastId;
          const fetched = await interaction.channel.messages.fetch(options);
          if (fetched.size === 0) break;
          fetched.forEach(m => messages.push(m));
          lastId = fetched.last().id;
        }
        messages.reverse();

        const transcriptLines = messages.map(m => {
          const date = new Date(m.createdTimestamp).toLocaleString('fr-FR');
          return `[${date}] ${m.author.username}: ${m.content || '(MBED/ATTACHMENT)'}`;
        });

        const header = `TRANSCRIPT — Ticket ${interaction.channel.name}\n` +
          `Fermé par: ${interaction.user.username}\n` +
          `Date: ${new Date().toLocaleString('fr-FR')}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        const transcript = header + transcriptLines.join('\n');
        const transcriptBuffer = Buffer.from(transcript, 'utf-8');

        if (creatorId) {
          try {
            const dmUser = await client.users.fetch(creatorId);
            await dmUser.send({
              content: `📬 Voici la transcription de ton ticket **${interaction.channel.name}** :`,
              files: [{
                attachment: transcriptBuffer,
                name: `transcript-${interaction.channel.name}.txt`,
              }],
            });
          } catch (err) {
            console.error('Erreur DM transcript:', err);
          }
        }

        setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
      } catch (err) {
        console.error(err);
      }
      return;
    }

    if (interaction.customId.startsWith('claim_ticket_')) {
      if (!hasModRole(interaction)) {
        return interaction.reply({ content: '❌ Seul le staff peut claim un ticket.', ephemeral: true });
      }

      try {
        const originalEmbed = interaction.message.embeds[0];
        const channelId = interaction.channel.id;
        const creatorId = ticketCreators.get(channelId) || '0';
        await interaction.message.edit({
          embeds: [{
            title: originalEmbed.title,
            description: originalEmbed.description,
            color: originalEmbed.color,
            footer: { text: `Claim par ${interaction.user.username}` },
            timestamp: originalEmbed.timestamp,
          }],
          components: [{
            type: 1,
            components: [{
              type: 2,
              style: 4,
              label: 'Fermer / Close',
              custom_id: 'close_ticket_' + creatorId,
            }],
          }],
        });
        await interaction.reply({ content: `✅ Ticket claim par <@${interaction.user.id}>.`, ephemeral: false });
        console.log(`Ticket claim par ${interaction.user.username}`);
      } catch (err) {
        console.error(err);
      }
      return;
    }

    return;
  }

  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ban') {
    if (!hasModRole(interaction)) {
      return interaction.reply({ content: '❌ Tu n\'as pas la permission.', ephemeral: true });
    }

    const membre = interaction.options.getMember('membre');
    const raison = interaction.options.getString('raison') || 'Aucune raison';

    if (!membre) {
      return interaction.reply({ content: '❌ Membre introuvable sur ce serveur.', ephemeral: true });
    }

    if (!membre.bannable) {
      return interaction.reply({ content: '❌ Je ne peux pas bannir ce membre (il est au-dessus de moi dans la hiérarchie).', ephemeral: true });
    }

    if (membre.roles.highest.position >= interaction.member.roles.highest.position) {
      return interaction.reply({ content: '❌ Tu ne peux pas bannir quelqu\'un de ton rang ou supérieur.', ephemeral: true });
    }

    try {
      await membre.ban({ reason: `${raison} — par ${interaction.user.username}` });
      await interaction.reply({
        content: `🔨 **${membre.user.username}** a été banni.\nRaison : ${raison}`,
      });
    } catch (err) {
      console.error(err);
      await interaction.reply({ content: '❌ Erreur lors du ban.', ephemeral: true });
    }
  }

  if (interaction.commandName === 'meetup') {
    if (!hasModRole(interaction)) {
      return interaction.reply({ content: '❌ Tu n\'as pas la permission.', ephemeral: true });
    }

    const salon = interaction.options.getChannel('salon') || interaction.channel;
    const logo = readFileSync('C:/Users/wizox/Downloads/zarek.63__2_-removebg-preview.png');

    const embed = {
      title: '<:6_32:1539072485817974794> ・ MEETUPS',
      description:
        '> **FR**\n' +
        '> **Envie de participer à un meetup ?**\n' +
        '> Rejoins la communauté **6.3 Drivers** et retrouve les autres membres lors de nos différents meetups.\n' +
        '> Toutes les informations concernant les dates, horaires et lieux seront communiquées ici.\n\n' +
        '> **GB**\n' +
        '> **Want to join a meetup?**\n' +
        '> Join the **6.3 Drivers** community and meet other members during our different meetups.\n' +
        '> All information regarding dates, times and locations will be shared here.\n\n' +
        '**Merci de respecter les règles lors des meetups.**\n' +
        '**Please respect the rules during meetups.**',
      color: 0x000000,
      thumbnail: { url: 'attachment://logo.png' },
      footer: {
        text: '6.3 Drivers - Meetups',
        icon_url: 'attachment://logo.png',
      },
    };

    const file = new AttachmentBuilder(logo, { name: 'logo.png' });

    try {
      await salon.send({ embeds: [embed], files: [file] });
      await interaction.reply({ content: `✅ Embed meetups envoyé dans ${salon} !`, ephemeral: true });
      console.log(`Embed meetups envoyé par ${interaction.user.username}`);
    } catch (err) {
      console.error(err);
      await interaction.reply({ content: '❌ Erreur lors de l\'envoi.', ephemeral: true });
    }
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  try {
    await member.roles.add(ROLE_NON_VERIFIE);
    console.log(`Rôle non-vérifié attribué à ${member.user.username}`);
  } catch (err) {
    console.error(`Erreur auto-role pour ${member.user.username}:`, err);
  }

  try {
    const logs = await client.channels.fetch(LOGS_CHANNEL);
    if (!logs?.isTextBased()) return;
    await logs.send({
      embeds: [{
        title: '📥 Membre rejoint',
        description: `<@${member.id}> (**${member.user.username}**)\n\nMembres total : **${member.guild.memberCount}**`,
        color: 0x57f287,
        thumbnail: { url: member.user.displayAvatarURL({ size: 256 }) },
        footer: { text: '6.3 Drivers - Logs' },
        timestamp: new Date().toISOString(),
      }],
    });
  } catch (err) {
    console.error('Erreur log join:', err);
  }
});

client.on(Events.GuildMemberRemove, async (member) => {
  try {
    const logs = await client.channels.fetch(LOGS_CHANNEL);
    if (!logs?.isTextBased()) return;
    await logs.send({
      embeds: [{
        title: '📤 Membre quitté',
        description: `**${member.user.username}** (${member.id})\n\nMembres total : **${member.guild.memberCount}**`,
        color: 0xed4245,
        thumbnail: { url: member.user.displayAvatarURL({ size: 256 }) },
        footer: { text: '6.3 Drivers - Logs' },
        timestamp: new Date().toISOString(),
      }],
    });
  } catch (err) {
    console.error('Erreur log leave:', err);
  }
});

client.on(Events.MessageDelete, async (message) => {
  if (message.author?.bot) return;
  if (!message.guild) return;
  try {
    const logs = await client.channels.fetch(LOGS_CHANNEL);
    if (!logs?.isTextBased()) return;
    await logs.send({
      embeds: [{
        title: '🗑️ Message supprimé',
        description:
          `**Auteur :** <@${message.author.id}> (${message.author.username})\n` +
          `**Salon :** <#${message.channel.id}>\n` +
          `**Contenu :** ${message.content ? message.content.slice(0, 1024) : '* vide *'}`,
        color: 0xed4245,
        footer: { text: '6.3 Drivers - Logs' },
        timestamp: new Date().toISOString(),
      }],
    });
  } catch (err) {
    console.error('Erreur log delete:', err);
  }
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  if (oldMessage.author?.bot) return;
  if (!oldMessage.guild) return;
  if (oldMessage.content === newMessage.content) return;
  try {
    const logs = await client.channels.fetch(LOGS_CHANNEL);
    if (!logs?.isTextBased()) return;
    await logs.send({
      embeds: [{
        title: '✏️ Message modifié',
        description:
          `**Auteur :** <@${oldMessage.author.id}> (${oldMessage.author.username})\n` +
          `**Salon :** <#${oldMessage.channel.id}>\n\n` +
          `**Avant :** ${oldMessage.content ? oldMessage.content.slice(0, 512) : '* vide *'}\n` +
          `**Après :** ${newMessage.content ? newMessage.content.slice(0, 512) : '* vide *'}`,
        color: 0xfee75c,
        footer: { text: '6.3 Drivers - Logs' },
        timestamp: new Date().toISOString(),
      }],
    });
  } catch (err) {
    console.error('Erreur log edit:', err);
  }
});

client.on(Events.GuildBanAdd, async (ban) => {
  try {
    const logs = await client.channels.fetch(LOGS_CHANNEL);
    if (!logs?.isTextBased()) return;
    await logs.send({
      embeds: [{
        title: '🔨 Membre banni',
        description:
          `**Utilisateur :** ${ban.user.username} (${ban.user.id})\n` +
          `**Raison :** ${ban.reason || 'Aucune raison'}`,
        color: 0xed4245,
        thumbnail: { url: ban.user.displayAvatarURL({ size: 256 }) },
        footer: { text: '6.3 Drivers - Logs' },
        timestamp: new Date().toISOString(),
      }],
    });
  } catch (err) {
    console.error('Erreur log ban:', err);
  }
});

client.on(Events.GuildBanRemove, async (ban) => {
  try {
    const logs = await client.channels.fetch(LOGS_CHANNEL);
    if (!logs?.isTextBased()) return;
    await logs.send({
      embeds: [{
        title: '🔓 Membre débanni',
        description: `**Utilisateur :** ${ban.user.username} (${ban.user.id})`,
        color: 0x57f287,
        thumbnail: { url: ban.user.displayAvatarURL({ size: 256 }) },
        footer: { text: '6.3 Drivers - Logs' },
        timestamp: new Date().toISOString(),
      }],
    });
  } catch (err) {
    console.error('Erreur log unban:', err);
  }
});

client.login(TOKEN);