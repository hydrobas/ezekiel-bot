const { Client, Util }          = require('discord.js');
const Discord                   = require('discord.js');
const { prefix }                = require('./config.js');
const token                     = process.env.token;
const apiKey                    = process.env.apiKey;
const YouTube                   = require('simple-youtube-api');
const ytdl                      = require('ytdl-core');

const client  = new Client({ disableEveryone: true });
const youtube = new YouTube(apiKey);
const queue   = new Map();

// Console Logs
client.on('warn', console.warn);
client.on('error', console.error);
client.on('ready', () =>
{
    console.log('I\'m ready now!');
    client.user.setActivity(',help');
});
client.on('disconnect', () => console.log('I just disconnected and wanted to let you know. I will reconnect now...'));
client.on('reconnecting', () => console.log('I\'m reconnecting now!'));

client.on('message', message =>
{
    if (message.isMentioned(client.user))
    {
        if (message.content.includes('who loves you?'))
        {
            message.channel.send
            ('Bene <:blob_love:467627635434848276>');
        }

        else if (message.content.includes('who do you love?'))
        {
            message.channel.send
            ('Bene <:sparkling_heart:467622379254710282>');
        }

        else
        {
            return undefined;
        }
    }
});

client.on('message', async msg =>
{
    // Bot will not respond if the author of the message is from itself or if there's no prefix
    if (msg.author.bot) return undefined;
    if (!msg.content.startsWith(prefix)) return undefined;

    //
    const args          = msg.content.substring(prefix.length).split(' ');
    const searchString  = args.slice(1).join(' ');
    const url = args[1] ? args[1].replace(/<(.+)>/g, '$1') : '';
    const serverQueue   = queue.get(msg.guild.id);

    // Bot Commands
    switch (args[0].toLowerCase())
    {
        // play command -- plays song
        case 'play':
        const voiceChannel = msg.member.voiceChannel;

        // If user isn't in a voice channel
        if (!voiceChannel) return msg.channel.send
        ('Sorry but you need to be in a voice channel first to play a song!');

        const permissions = voiceChannel.permissionsFor(msg.client.user);

        // If bot hasn't received proper permissions to join & speak in a voice channel
        if (!permissions.has('CONNECT'))
        {
            return msg.channel.send
            ('I cannot connect to your voice channel. Please make sure I have the proper permissions!');
        }
        if (!permissions.has('SPEAK'))
        {
            return msg.channel.send
            ('I cannot speak in your voice channel. Please make sure I have the proper permissions!');
        }

        // Adding a playlist can only work if the playlist is saved from user's YouTube account
        if (url.match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/))
        {
            const playlist  = await youtube.getPlaylist(url);
            const videos    = await playlist.getVideos();

            for (const video of Object.values(videos))
            {
                const video2 = await youtube.getVideoByID(video.id);
                await handleVideo(video2, msg, voiceChannel, true);
            }
            return msg.channel.send(`:minidisc: Playlist: **${playlist.title}** has been added to the queue!`);
        }
        else
        {
            try
            {
                var video = await youtube.getVideo(url);
            }
            catch(error)
            {
                try
                {
                    var videos = await youtube.searchVideos(searchString, 10);
                    let index = 0;

                    msg.channel.send
                    (`
                    :mag: **SONG SEARCH RESULTS**
                    \n${videos.map(video2 => `**${++index}** - ${video2.title}`).join('\n\n')}
                    \n---------------------------------------------------
                    \nPlease input a number ranging from **1~10** to select one of the search results within **15 seconds**.\nIf the time limit expires then song selection will be cancelled immediately, so please be careful!`);

                    try
                    {
                        var response = await msg.channel.awaitMessages(msg2 => msg2.content > 0 && msg2.content < 11,
                        {
                            maxMatches: 1,
                            time: 15000,
                            errors: ["time"]
                        })
                    }
                    catch(err)
                    {
                        console.error(err);
                        return msg.channel.send("<:no_entry_sign:467531099279458330> **CANCELLING:** No number entered within the 15 second timeframe. Cancelling song selection now...");
                    }
                    const videoIndex = parseInt(response.first().content);
                    var video  = await youtube.getVideoByID(videos[videoIndex - 1].id);
                }
                catch(err)
                {
                    console.error(err);
                    return msg.channel.send
                    ("I couldn't obtain any search results.");
                }
            }
                return handleVideo(video, msg, voiceChannel);
        }
        break;

        // skip command -- skips to the next song
        case 'skip':
        if (!msg.member.voiceChannel)
        return msg.channel.send
        ('I can\'t skip to the next song if there\'s no song playing right now. Please add a song first!');

        serverQueue.connection.dispatcher.end('Skip command has been used.');

        return msg.channel.send
        (`Skipping to next song: **${serverQueue.songs[0].title}**`);
        return undefined;

        break;

        // pause command -- pauses song
        case 'pause':
        if (serverQueue && serverQueue.playing)
        {
            serverQueue.playing = false;
            serverQueue.connection.dispatcher.pause('Pause command has been used.');

            return msg.channel.send
            ('OK! I have paused the current song for you.');
        }
        // If someone uses this command while there's no song playing
        return msg.channel.send
        ('I can\'t pause the song if there\'s no song playing right now. Please add a song first!');

        break;

        // stop command -- stops song
        case 'stop':
        if (!msg.member.voiceChannel)
        return msg.channel.send
        ('You need to be in a voice channel first before you can use the stop command!');
        if (!serverQueue) return msg.channel.send
        ('I can\'t stop the song if there\'s no song playing right now. Please add a song first!');

        serverQueue.songs = [];
        serverQueue.connection.dispatcher.end('Stop command has been used.');

        return undefined;

        break;

        // resume command -- resumes paused song
        case 'resume':
        if (serverQueue && !serverQueue.playing)
        {
            serverQueue.playing = true;
            serverQueue.connection.dispatcher.resume('Resume command has been used.');

            return msg.channel.send
            ('OK! I have resumed the current song for you.');
        }
        // If someone uses this command before giving the bot a song to play
        return msg.channel.send
        ('I can\'t resume the song if there\'s no song playing right now. Please add a song first!');

        break;

        // volume command -- adjust volume level
        case 'vol':
        case 'volume':
        if (!serverQueue) return msg.channel.send
        ('I can\'t set the volume level if there\'s no song playing right now. Please add a song first!');

        if (!args[1]) return msg.channel.send
        (`Current volume is: **${serverQueue.volume}**`);

        serverQueue.volume = args[1];
        serverQueue.connection.dispatcher.setVolumeLogarithmic(args[1] / 5);

        return msg.channel.send
        (`I have set the volume to **${[args[1] / 5]}**`);

        break;

        // np command -- now playing; see what song is currently playing
        case 'np':
        if (!serverQueue) return msg.content.channel.send
        ('There\'s no song playing right now so it isn\'t possible for me to do this command. Please add a song first!');

        return msg.channel.send
        (`:sparkles: Now playing: **${serverQueue.songs[0].title}**`);

        break;

        // ns command -- next song; see what song will play next
        case 'ns':
        if (!serverQueue) return msg.content.channel.send
        ('There\'s no song playing right now so it isn\'t possible for me to do this command. Please add a song first!');
        
        return msg.channel.send
        (`:sparkles: Next song in the queue: **${serverQueue.songs[1].title}**`);

        break;

        // queue command -- see what song(s) are listed in the queue
        case 'queue':
        if (!serverQueue) return msg.channel.send
        ('There\'s no song playing right now so it isn\'t possible for me to do this command. Please add a song first!');

        return msg.channel.send
        (':page_facing_up: **QUEUE LIST**\n\n'
        + serverQueue.songs.map(song => '**• **'
        + song.title).join('\n\n')
        + '\n\n **Now Playing: **' + serverQueue.songs[0].title);

        break;

        case 'help':
        return msg.channel.send
        ("<:question:466962013596418058> Command Help\n"
          + "---------------------------------------------------"
          + "\n\n **,play** __youtube url__, __song title__, or __playlist url__ -- Play song. If there's already a song that's currently playing it will add it to the queue instead. Please note that playlist only works if it's created or saved in your YouTube/Google account."
          + "\n\n **,skip** -- Skip to the next song."
          + "\n\n **,pause** -- Pause the current song that's playing."
          + "\n\n **,resume** -- Resume the current song."
          + "\n\n **,stop** -- Stop and leave the voice channel."
          + "\n\n **,np** -- See what song is currently playing."
          + "\n\n **,queue** -- See what song(s) are placed in the queue."
          + "\n\n **,volume** || **,vol** x -- Set the volume level. Replace the x with a number from 0 to 5."
          + "\n\n---------------------------------------------------"
          + "\n\n **14/07/18:** Added more information in play command section."
          + "\nThis will be updated in the future to make it more visually appealing and improve readability.");
          break;

        case 'test':
        var embed = new Discord.RichEmbed()
            .setAuthor('Now Playing', client.user.avatarURL)
            .setTitle(`${serverQueue.songs[0].title}`)
            .addField('Test Title 1', 'Test Description 1', true)
            .addField('Test Title 2', 'Test Description 2', true)
            .setColor(15836697)
            .setThumbnail(client.user.avatarURL)

        msg.channel.send({embed});
        break;
        default:
        msg.channel.send('Invalid command!');
          
    }
    async function handleVideo(video, msg, voiceChannel, playlist = false)
    {
        const serverQueue = queue.get(msg.guild.id);
        console.log(video);
        const song =
        {
            id: video.id,
            title: Util.escapeMarkdown(video.title),
            url: `https://www.youtube.com/watch?v=${video.id}`
        };

        // Creates queue
        if (!serverQueue)
        {
            const queueConstruct =
            {
                textChannel: msg.channel,
                voiceChannel: voiceChannel,
                connection: null,
                songs: [],
                volume: 5,
                playing: true
            };
            queue.set(msg.guild.id, queueConstruct);
            queueConstruct.songs.push(song);
            
            // Bot joining voice channel
            try
            {
                var connection            = await voiceChannel.join();
                queueConstruct.connection = connection;

                play(msg.guild, queueConstruct.songs[0]);
            }
            catch(error)
            {
                console.error('Unable to join voice channel.');
                queue.delete(msg.guild.id);
                return msg.channel.send('Unable to join voice channel!');
            }
            // Informs user that song is now playing
            return msg.channel.send(`:notes: **${song.title}** is now playing!`);
        }
        else
        {
            serverQueue.songs.push(song);
            console.log(serverQueue.songs);

            if (playlist) return undefined;

            // Adds song into queue
            else return msg.channel.send
            (`**${song.title}** has been added to the queue!`);
        }
        return undefined;
    }
    function play(guild, song)
    {
        const serverQueue = queue.get(guild.id);

        if (!song)
        {
            serverQueue.voiceChannel.leave();
            queue.delete(guild.id);
            return;
        }
        const dispatcher = serverQueue.connection.playStream(ytdl(song.url))
            .on('end', (reason) =>
                {
                    console.log(reason);
                    serverQueue.songs.shift();
                    // I think somewhere here I need to add a recursive function to make song repeat/loop
                    play(guild, serverQueue.songs[0]);
                })
            .on('error', error => console.error(error));

            // Volume
            dispatcher.setVolumeLogarithmic(5 / 5);
    }
});
client.login(process.env.token);
