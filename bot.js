const { Client, GatewayIntentBits, Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration
    ] 
});

// Sistema de warns (em memória - você pode conectar com banco de dados depois)
const userWarns = new Map();
const mutedUsers = new Map();

// Evento quando o bot fica online
client.once(Events.ClientReady, readyClient => {
    console.log(`🛡️ Bot de Moderação online! Logado como ${readyClient.user.tag}`);
});

// Função para verificar se o usuário tem permissão de moderador
function hasModPermission(member) {
    return member.permissions.has(PermissionsBitField.Flags.ModerateMembers) ||
           member.permissions.has(PermissionsBitField.Flags.Administrator) ||
           member.permissions.has(PermissionsBitField.Flags.ManageMessages);
}

// Função para criar embed de log
function createLogEmbed(action, moderator, target, reason, color = '#FF6B6B') {
    return new EmbedBuilder()
        .setColor(color)
        .setTitle(`🛡️ **${action.toUpperCase()}**`)
        .addFields(
            { name: '👤 **Usuário:**', value: `${target.tag} (${target.id})`, inline: true },
            { name: '🛡️ **Moderador:**', value: `${moderator.tag}`, inline: true },
            { name: '📝 **Motivo:**', value: reason || 'Não informado', inline: false }
        )
        .setThumbnail(target.displayAvatarURL())
        .setTimestamp();
}

// Responder a comandos
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;
    if (!message.guild) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // ===== COMANDO BAN =====
    if (command === 'ban') {
        if (!hasModPermission(message.member)) {
            return message.reply('❌ Você não tem permissão para banir usuários!');
        }

        const user = message.mentions.users.first() || await client.users.fetch(args[0]).catch(() => null);
        if (!user) {
            return message.reply('❌ Mencione um usuário válido! Uso: `!ban @usuário [motivo]`');
        }

        const member = message.guild.members.cache.get(user.id);
        if (member && !member.bannable) {
            return message.reply('❌ Não posso banir este usuário!');
        }

        const reason = args.slice(1).join(' ') || 'Não informado';

        try {
            await message.guild.members.ban(user, { reason: reason });
            
            const embed = createLogEmbed('ban', message.author, user, reason, '#FF0000');
            message.reply({ embeds: [embed] });

        } catch (error) {
            message.reply('❌ Erro ao banir o usuário!');
        }
    }

    // ===== COMANDO KICK =====
    if (command === 'kick') {
        if (!hasModPermission(message.member)) {
            return message.reply('❌ Você não tem permissão para expulsar usuários!');
        }

        const user = message.mentions.users.first();
        if (!user) {
            return message.reply('❌ Mencione um usuário! Uso: `!kick @usuário [motivo]`');
        }

        const member = message.guild.members.cache.get(user.id);
        if (!member || !member.kickable) {
            return message.reply('❌ Não posso expulsar este usuário!');
        }

        const reason = args.slice(1).join(' ') || 'Não informado';

        try {
            await member.kick(reason);
            
            const embed = createLogEmbed('kick', message.author, user, reason, '#FF9500');
            message.reply({ embeds: [embed] });

        } catch (error) {
            message.reply('❌ Erro ao expulsar o usuário!');
        }
    }

    // ===== COMANDO MUTE/TIMEOUT =====
    if (command === 'mute' || command === 'timeout') {
        if (!hasModPermission(message.member)) {
            return message.reply('❌ Você não tem permissão para mutar usuários!');
        }

        const user = message.mentions.users.first();
        if (!user) {
            return message.reply('❌ Mencione um usuário! Uso: `!mute @usuário [tempo] [motivo]`');
        }

        const member = message.guild.members.cache.get(user.id);
        if (!member || !member.moderatable) {
            return message.reply('❌ Não posso mutar este usuário!');
        }

        const timeArg = args[1] || '10m';
        const reason = args.slice(2).join(' ') || 'Não informado';

        // Converter tempo (ex: 10m, 1h, 2d)
        let duration = 10 * 60 * 1000; // 10 minutos padrão
        const timeMatch = timeArg.match(/^(\d+)([mhd])$/);
        if (timeMatch) {
            const value = parseInt(timeMatch[1]);
            const unit = timeMatch[2];
            switch (unit) {
                case 'm': duration = value * 60 * 1000; break;
                case 'h': duration = value * 60 * 60 * 1000; break;
                case 'd': duration = value * 24 * 60 * 60 * 1000; break;
            }
        }

        try {
            await member.timeout(duration, reason);
            
            const embed = createLogEmbed('mute', message.author, user, `${reason} | Duração: ${timeArg}`, '#9B59B6');
            message.reply({ embeds: [embed] });

        } catch (error) {
            message.reply('❌ Erro ao mutar o usuário!');
        }
    }

    // ===== COMANDO UNMUTE =====
    if (command === 'unmute') {
        if (!hasModPermission(message.member)) {
            return message.reply('❌ Você não tem permissão para desmutar usuários!');
        }

        const user = message.mentions.users.first();
        if (!user) {
            return message.reply('❌ Mencione um usuário! Uso: `!unmute @usuário`');
        }

        const member = message.guild.members.cache.get(user.id);
        if (!member) {
            return message.reply('❌ Usuário não encontrado!');
        }

        try {
            await member.timeout(null);
            
            const embed = createLogEmbed('unmute', message.author, user, 'Removido timeout', '#00FF00');
            message.reply({ embeds: [embed] });

        } catch (error) {
            message.reply('❌ Erro ao desmutar o usuário!');
        }
    }

    // ===== COMANDO WARN =====
    if (command === 'warn') {
        if (!hasModPermission(message.member)) {
            return message.reply('❌ Você não tem permissão para avisar usuários!');
        }

        const user = message.mentions.users.first();
        if (!user) {
            return message.reply('❌ Mencione um usuário! Uso: `!warn @usuário [motivo]`');
        }

        const reason = args.slice(1).join(' ') || 'Não informado';

        // Adicionar warn
        if (!userWarns.has(user.id)) {
            userWarns.set(user.id, []);
        }
        userWarns.get(user.id).push({
            reason: reason,
            moderator: message.author.tag,
            date: new Date().toLocaleString('pt-BR')
        });

        const warnCount = userWarns.get(user.id).length;

        const embed = createLogEmbed('warn', message.author, user, `${reason} | Warns: ${warnCount}`, '#FFD700');
        message.reply({ embeds: [embed] });

        // Auto-punição baseada em warns
        if (warnCount >= 3) {
            const member = message.guild.members.cache.get(user.id);
            if (member && member.moderatable) {
                await member.timeout(60 * 60 * 1000, 'Muitos warns'); // 1 hora
                message.channel.send(`⚠️ ${user.tag} foi mutado por 1 hora devido a muitos warns!`);
            }
        }
    }

    // ===== COMANDO WARNS =====
    if (command === 'warns') {
        const user = message.mentions.users.first() || message.author;
        const warns = userWarns.get(user.id) || [];

        if (warns.length === 0) {
            return message.reply(`✅ ${user.tag} não possui warns!`);
        }

        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle(`⚠️ **Warns de ${user.tag}**`)
            .setThumbnail(user.displayAvatarURL())
            .setDescription(`**Total: ${warns.length} warns**\n\n` +
                warns.map((warn, index) => 
                    `**${index + 1}.** ${warn.reason}\n` +
                    `📅 ${warn.date} | 🛡️ ${warn.moderator}`
                ).join('\n\n'))
            .setTimestamp();

        message.reply({ embeds: [embed] });
    }

    // ===== COMANDO CLEAR/PURGE =====
    if (command === 'clear' || command === 'purge') {
        if (!hasModPermission(message.member)) {
            return message.reply('❌ Você não tem permissão para limpar mensagens!');
        }

        const amount = parseInt(args[0]);
        if (!amount || amount < 1 || amount > 100) {
            return message.reply('❌ Especifique um número entre 1 e 100! Uso: `!clear [número]`');
        }

        try {
            const deleted = await message.channel.bulkDelete(amount + 1, true);
            
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🧹 **MENSAGENS LIMPAS**')
                .setDescription(`✅ **${deleted.size - 1} mensagens** foram deletadas!`)
                .addFields(
                    { name: '🛡️ **Moderador:**', value: message.author.tag, inline: true },
                    { name: '📍 **Canal:**', value: message.channel.name, inline: true }
                )
                .setTimestamp();

            const reply = await message.channel.send({ embeds: [embed] });
            setTimeout(() => reply.delete().catch(() => {}), 5000);

        } catch (error) {
            message.reply('❌ Erro ao limpar mensagens! (Mensagens muito antigas não podem ser deletadas)');
        }
    }

    // ===== COMANDO SLOWMODE =====
    if (command === 'slowmode' || command === 'slow') {
        if (!hasModPermission(message.member)) {
            return message.reply('❌ Você não tem permissão para alterar slowmode!');
        }

        const seconds = parseInt(args[0]);
        if (isNaN(seconds) || seconds < 0 || seconds > 21600) {
            return message.reply('❌ Especifique um tempo entre 0 e 21600 segundos! Uso: `!slowmode [segundos]`');
        }

        try {
            await message.channel.setRateLimitPerUser(seconds);
            
            const embed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle('⏱️ **SLOWMODE ALTERADO**')
                .setDescription(seconds === 0 ? '✅ Slowmode **desativado**!' : `✅ Slowmode definido para **${seconds} segundos**!`)
                .addFields(
                    { name: '🛡️ **Moderador:**', value: message.author.tag, inline: true },
                    { name: '📍 **Canal:**', value: message.channel.name, inline: true }
                )
                .setTimestamp();

            message.reply({ embeds: [embed] });

        } catch (error) {
            message.reply('❌ Erro ao alterar slowmode!');
        }
    }

    // ===== COMANDO LOCK =====
    if (command === 'lock') {
        if (!hasModPermission(message.member)) {
            return message.reply('❌ Você não tem permissão para trancar canais!');
        }

        try {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
                SendMessages: false
            });

            const embed = new EmbedBuilder()
                .setColor('#E74C3C')
                .setTitle('🔒 **CANAL TRANCADO**')
                .setDescription('✅ Canal trancado! Apenas moderadores podem enviar mensagens.')
                .addFields(
                    { name: '🛡️ **Moderador:**', value: message.author.tag, inline: true },
                    { name: '📍 **Canal:**', value: message.channel.name, inline: true }
                )
                .setTimestamp();

            message.reply({ embeds: [embed] });

        } catch (error) {
            message.reply('❌ Erro ao trancar o canal!');
        }
    }

    // ===== COMANDO UNLOCK =====
    if (command === 'unlock') {
        if (!hasModPermission(message.member)) {
            return message.reply('❌ Você não tem permissão para destrancar canais!');
        }

        try {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
                SendMessages: null
            });

            const embed = new EmbedBuilder()
                .setColor('#27AE60')
                .setTitle('🔓 **CANAL DESTRANCADO**')
                .setDescription('✅ Canal destrancado! Todos podem enviar mensagens novamente.')
                .addFields(
                    { name: '🛡️ **Moderador:**', value: message.author.tag, inline: true },
                    { name: '📍 **Canal:**', value: message.channel.name, inline: true }
                )
                .setTimestamp();

            message.reply({ embeds: [embed] });

        } catch (error) {
            message.reply('❌ Erro ao destrancar o canal!');
        }
    }

    // ===== COMANDO USERINFO =====
    if (command === 'userinfo' || command === 'user') {
        const user = message.mentions.users.first() || message.author;
        const member = message.guild.members.cache.get(user.id);

        const embed = new EmbedBuilder()
            .setColor('#3498DB')
            .setTitle(`👤 **Informações de ${user.tag}**`)
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: '🆔 **ID:**', value: user.id, inline: true },
                { name: '📅 **Conta criada:**', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`, inline: true },
                { name: '📥 **Entrou no servidor:**', value: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>` : 'N/A', inline: true },
                { name: '⚠️ **Warns:**', value: `${userWarns.get(user.id)?.length || 0}`, inline: true },
                { name: '🤖 **Bot:**', value: user.bot ? 'Sim' : 'Não', inline: true },
                { name: '🎭 **Cargos:**', value: member ? member.roles.cache.filter(r => r.id !== message.guild.id).map(r => r.name).join(', ') || 'Nenhum' : 'N/A', inline: false }
            )
            .setTimestamp();

        message.reply({ embeds: [embed] });
    }

    // ===== COMANDO AJUDA MODERAÇÃO =====
    if (command === 'modhelp' || command === 'ajudamod') {
        const embed = new EmbedBuilder()
            .setColor('#9B59B6')
            .setTitle('🛡️ **COMANDOS DE MODERAÇÃO**')
            .setDescription('**Lista completa de comandos disponíveis:**')
            .addFields(
                { name: '🔨 **Punições:**', value: '`!ban @user [motivo]` - Banir usuário\n`!kick @user [motivo]` - Expulsar usuário\n`!mute @user [tempo] [motivo]` - Mutar usuário\n`!unmute @user` - Desmutar usuário', inline: false },
                { name: '⚠️ **Sistema de Warns:**', value: '`!warn @user [motivo]` - Avisar usuário\n`!warns [@user]` - Ver warns de um usuário', inline: false },
                { name: '🧹 **Limpeza:**', value: '`!clear [número]` - Limpar mensagens\n`!slowmode [segundos]` - Alterar slowmode', inline: false },
                { name: '🔒 **Controle de Canal:**', value: '`!lock` - Trancar canal\n`!unlock` - Destrancar canal', inline: false },
                { name: '📊 **Informações:**', value: '`!userinfo [@user]` - Info do usuário\n`!modhelp` - Esta mensagem', inline: false }
            )
            .setFooter({ text: 'Use os comandos com responsabilidade!' })
            .setTimestamp();

        message.reply({ embeds: [embed] });
    }
});

// Para manter o processo ativo no Render
const PORT = process.env.PORT || 3000;
const express = require('express');
const app = express();

app.get('/', (req, res) => {
    res.send('Bot de Moderação está rodando! 🛡️');
});

app.listen(PORT, () => {
    console.log(`🌐 Servidor rodando na porta ${PORT}`);
});

// Token do Discord (usar variável de ambiente para segurança)
const token = process.env.DISCORD_TOKEN || 'MTM4MDA1OTgwMjU1MzY4Mzk3OQ.G6QxGG.wnKmpR20tmlq4vMe73cMDaNPG8GWT5sM4aZJdc';
client.login(token);