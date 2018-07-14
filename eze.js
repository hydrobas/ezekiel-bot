const { Client, Util } = require("discord.js");
const { prefix } = require("./config.js");
const token = process.env.token;
const apiKey = process.env.apiKey;
const YouTube = require("simple-youtube-api");
const ytdl = require("ytdl-core");

const client = new Client({ disableEveryone: true });
const youtube = new YouTube(apiKey);
const queue  = new Map();

// Console Logs
client.on("warn", console.warn);
client.on("error", console.error);
client.on("ready", () => console.log("I'm ready!"));
client.on("disconnect", () => console.log("I just disconnected and wanted to let you know. I will reconnect now..."));
client.on("reconnecting", () => console.log("I'm reconnecting now!"));

client.on("message", async msg =>
{
    // Bot will not respond if the author of the message is from itself or if there's no prefix
    if (msg.author.bot) return undefined;
    if (!msg.content.startsWith(prefix)) return undefined;

    const args = msg.content.split(" ");
    const searchString = args.slice(1).join(" ");
    const url  = args[1] ? args[1].replace(/<(.+)>/g, '$1') : "";
    const serverQueue = queue.get(msg.guild.id);

    // play command -- this will play the song
    if (msg.content.startsWith(`${prefix}play`))
    {
        const voiceChannel = msg.member.voiceChannel;

        // If user isn't in a voice channel
        if (!voiceChannel) return msg.channel.send
        ("I'm sorry but you need to be in a voice channel to play a song!");

        const permissions = voiceChannel.permissionsFor(msg.client.user);

        // If bot hasn't received proper permissions to join & speak in voice channel
        if (!permissions.has("CONNECT"))
        {
            return msg.channel.send
            ("I cannot connect to your voice channel. Please make sure I have the proper permissions!");
        }

        if (!permissions.has("SPEAK"))
        {
            return msg.channel.send
            ("I cannot speak in your voice channel. Please make sure I have the proper permissions!");
        }

        // Adding a playlist can only work if the playlist is from your YouTube account
        if (url.match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/))
        {
            const playlist = await youtube.getPlaylist(url);
            const videos   = await playlist.getVideos();
            
            for (const video of Object.values(videos))
            {
                const video2 = await youtube.getVideoByID(video.id);
                await handleVideo(video2, msg, voiceChannel, true);
            }

            return msg.channel.send(`Playlist: **${playlist.title}** has been added to the queue!`);
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
                    <:label:467525390626193409> **Song Selection:**
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
    }

    // skip command -- this will skip the song to the next one in queue
    else if (msg.content.startsWith(`${prefix}skip`))
    {
        if (!msg.member.voiceChannel)
        return msg.channel.send("You're not in a voice channel!");

        if (!serverQueue) return msg.channel.send
        ("I can't skip to the next song if there's no song playing right now. Please add a song first!");

        serverQueue.connection.dispatcher.end("Skip command has been used.");

        return msg.channel.send
        (`Skipping to next song: **${serverQueue.songs[0].title}**`);
        
        return undefined;
    }

    // pause command -- this will pause the song
    else if (msg.content.startsWith(`${prefix}pause`))
    {
        if (serverQueue && serverQueue.playing)
        {
            serverQueue.playing = false;
            serverQueue.connection.dispatcher.pause("Pause command has been used.");
    
            return msg.channel.send
            ("OK! I have paused the current song for you.");
        }
        
        return msg.channel.send
        ("I can't pause the song if there's no song playing right now. Please add a song first!");
    }

    // stop command -- this will stop the song, bot will leave voice channel
    else if (msg.content.startsWith(`${prefix}stop`))
    {
        if (!msg.member.voiceChannel)
        return msg.channel.send
        ("You're not in a voice channel!");
        if (!serverQueue) return msg.channel.send
        ("I can't stop the song if there's no song playing right now. Please add a song first!");
        
        serverQueue.songs = [];
        serverQueue.connection.dispatcher.end("Stop command has been used.");

        return undefined;
    }

    // resume command -- this will resume the song
    else if (msg.content.startsWith(`${prefix}resume`))
    {
        if (serverQueue && !serverQueue.playing)
        {
            serverQueue.playing = true;
            serverQueue.connection.dispatcher.resume("Resume command has been used.");

            return msg.channel.send
            ("OK! I have resumed the current song for you.");
        }
        
        return msg.channel.send
        ("I can't resume the song if there's no song playing right now. Please add a song first!");
    }

    // volume command -- this will allow user to set volume level
    else if (msg.content.startsWith(`${prefix}volume`))
    {
        if (!serverQueue) return msg.channel.send
        ("I can't set the volume level if there's no song playing right now. Please add a song first!");

        if (!args[1]) return msg.channel.send
        (`The current volume is: **${serverQueue.volume}**`);

        serverQueue.volume = args[1];
        serverQueue.connection.dispatcher.setVolumeLogarithmic(args[1] / 5);

        return msg.channel.send
        (`I have set the volume to **${[args[1] / 5]}**`);
    }

    // np command -- stands for "now playing" -- shows what song is currently playing
    else if (msg.content.startsWith(`${prefix}np`))
    {
        if (!serverQueue) return msg.content.channel.send
        ("There's no song playing right now so it isn't possible for me to do this command. Please add a song first!");
        
        return msg.channel.send
        ("Now currently playing: **" + serverQueue.songs[0].title + "**");
    }
    
    // pudding command -- pudding
    else if (msg.content.startsWith(prefix + "pudding"))
    {
        return msg.channel.send
        ("<:custard:467017695188221952>");
    }

    // queue command --
    else if (msg.content.startsWith(prefix + "queue"))
    {
        if (!serverQueue) return msg.channel.send
        ("There's no song playing right now so it isn't possible for me to do this command. Please add a song first!");

        return msg.channel.send
        ("<:notes:466952873951887362> **QUEUE LIST:**\n\n"
         + serverQueue.songs.map(song => "**• **"
         + song.title).join("\n\n")
         + "\n\n **Now Playing: **" + serverQueue.songs[0].title);
    }

    // help command -- prints out a list of commands
    else if (msg.content.startsWith(prefix + "help"))
    {
        return msg.channel.send
        ("<:question:466962013596418058> Command Help\n"
          + "---------------------------------------------------"
          + "\n\n **,play** __youtube url__, __song title__, or __playlist url__ -- Play song. If there's already a song that's currently playing it will be added it to the queue instead. "
          + "Please note that playlist will only work if 1) it's created or saved in your YouTube/Google account, and 2) playlist contains less than **22 videos**."
          + "\n\n **,skip** -- Skip to the next song."
          + "\n\n **,pause** -- Pause the current song that's playing."
          + "\n\n **,resume** -- Resume the current song."
          + "\n\n **,stop** -- Stop and leave the voice channel."
          + "\n\n **,np** -- See what song is currently playing."
          + "\n\n **,queue** -- See what song(s) are placed in the queue."
          + "\n\n **,volume** x -- Set the volume level. Replace the x with a number from 0 to 5."
          + "\n\n **,pudding** -- <:custard:467017695188221952>"
          + "\n\n---------------------------------------------------"
          + "\n\n **14/07/18:** Added more information in play command section."
          + "\nThis will be updated in the future to make it more visually appealing and improve readability.");
    }


    // leave command -- bot will leave the voice channel
    else if (msg.content.startsWith(prefix + "leave"))
    {
        if (!msg.member.voiceChannel)
        return msg.channel.send
        ("You're not in a voice channel!");

        msg.member.voiceChannel.leave();
    }

    return undefined;

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
        
        // Creating queue
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
                var connection = await voiceChannel.join();
                queueConstruct.connection = connection;

                play(msg.guild, queueConstruct.songs[0]);
            }

            // If bot is not able to join voice channel
            catch(error)
            {
                console.error("Unable to join voice channel.");
                queue.delete(msg.guild.id);
                return msg.channel.send("Unable to join voice channel!");
            }

            // Informs user that the song is now playing
            return msg.channel.send(`**${song.title}** is now playing!`);
        }

        else
        {
            serverQueue.songs.push(song);
            console.log(serverQueue.songs);
            
            if(playlist) return undefined;
            
            // Add song to the queue
            else return msg.channel.send(`**${song.title}** has been added to the queue!`);
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
            .on("end", (reason) =>
                {
                    console.log
                    (reason);

                    serverQueue.songs.shift();
                    play(guild, serverQueue.songs[0]);
                })
            
            .on("error", error => console.error(error));

            //Volume
            dispatcher.setVolumeLogarithmic(5 / 5);
    }
});

client.login(process.env.token);
