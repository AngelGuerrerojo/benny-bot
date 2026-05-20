require('dotenv').config();
const { Client, GatewayIntentBits, AttachmentBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const { createCanvas } = require('canvas'); // Importamos la nueva librería gráfica

// =========================================================
// FACHADA PARA ENGAÑAR A RENDER (Express)
// =========================================================
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('El bot está vivo y funcionando correctamente.');
});

app.listen(PORT, () => {
    console.log(`Servidor web falso abierto en el puerto ${PORT}. Listo para Render.`);
});

// =========================================================
// CONFIGURACIÓN DEL BOT DE DISCORD
// =========================================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.on('ready', async () => {
    console.log(`¡Bot encendido y conectado como ${client.user.tag}!`);
    
    try {
        console.log('Registrando comandos de barra (Slash Commands)...');
        
        await client.application.commands.set([
            {
                name: 'limpiar',
                description: 'Limpia una cantidad específica de mensajes en el chat.',
                options: [
                    {
                        name: 'cantidad',
                        description: 'Cuántos mensajes quieres borrar (1-100)',
                        type: 4, // INTEGER
                        required: true
                    }
                ]
            },
            {
                name: 'extraerfrases',
                description: 'Saca el historial de frases para los Bennys en un archivo txt.',
                options: [
                    {
                        name: 'anio',
                        description: 'Filtro por año (Ej: 2026)',
                        type: 3, // STRING
                        required: false
                    }
                ]
            },
            {
                name: 'citar',
                description: 'Crea una imagen de cita al estilo pensador célebre.',
                options: [
                    {
                        name: 'frase',
                        description: 'La frase que quieres inmortalizar',
                        type: 3, // STRING
                        required: true
                    },
                    {
                        name: 'autor',
                        description: 'Quién dijo esta joya',
                        type: 3, // STRING
                        required: true
                    }
                ]
            }
        ]);

        console.log('Comandos registrados con éxito.');
    } catch (error) {
        console.error('Error registrando los comandos:', error);
    }
});

client.on('interactionCreate', async interaction => {
    // Verificamos que sea un comando de barra
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // ---------------------------------------------------------
    // COMANDO 1: EL CONSERJE (/limpiar)
    // ---------------------------------------------------------
    if (commandName === 'limpiar') {
        if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({ content: "No tienes permisos para gestionar mensajes.", ephemeral: true });
        }

        const cantidad = interaction.options.getInteger('cantidad');

        if (cantidad <= 0 || cantidad > 100) {
            return interaction.reply({ content: "Por favor, ingresa un número del 1 al 100.", ephemeral: true });
        }

        try {
            const mensajesBorrados = await interaction.channel.bulkDelete(cantidad, true);
            const aviso = await interaction.reply({ content: `✅ Se han borrado ${mensajesBorrados.size} mensajes.`, fetchReply: true });
            
            setTimeout(() => {
                aviso.delete().catch(() => {});
            }, 5000);

        } catch (error) {
            console.error(error);
            interaction.reply({ content: "Ocurrió un error. Verifica que el bot tenga permisos de 'Gestionar mensajes'.", ephemeral: true });
        }
    }

    // ---------------------------------------------------------
    // COMANDO 2: EL ARCHIVISTA (/extraerfrases)
    // ---------------------------------------------------------
    if (commandName === 'extraerfrases') {
        const targetYear = interaction.options.getString('anio');

        let mensajeInicio = targetYear 
            ? `Iniciando extracción de frases del año ${targetYear}...`
            : `Iniciando extracción de todo el historial de frases...`;

        try {
            await interaction.deferReply();
            await interaction.editReply(mensajeInicio);
            
            let allMessages = [];
            let lastId = null;
            let isFetching = true;

            while (isFetching) {
                const options = { limit: 100 };
                if (lastId) options.before = lastId;

                const messages = await interaction.channel.messages.fetch(options);
                
                if (messages.size === 0) {
                    isFetching = false;
                    break;
                }

                for (const msg of messages.values()) {
                    if (msg.author.bot || msg.content.startsWith('!') || msg.content.startsWith('/')) continue;

                    const msgYear = new Date(msg.createdTimestamp).getFullYear().toString();

                    if (targetYear) {
                        if (parseInt(msgYear) < parseInt(targetYear)) {
                            isFetching = false;
                            break; 
                        }
                        if (msgYear !== targetYear) continue;
                    }

                    let cleanContent = msg.content;
                    cleanContent = cleanContent.replace(/''/g, '"'); 
                    cleanContent = cleanContent.replace(/\r?\n|\r/g, ' | '); 
                    cleanContent = cleanContent.replace(/ \|\s*[-*]\s*/g, ' | '); 
                    cleanContent = cleanContent.replace(/\s{2,}/g, ' '); 
                    cleanContent = cleanContent.trim(); 
                    
                    if (cleanContent) {
                        allMessages.push(cleanContent);
                    }
                }

                if (!isFetching) break;
                lastId = messages.last().id;
                await new Promise(resolve => setTimeout(resolve, 500)); 
            }

            allMessages.reverse();

            if (allMessages.length === 0) {
                return interaction.editReply(`No se encontraron frases documentadas para el año ${targetYear}.`);
            }

            const yearLabel = targetYear ? targetYear : 'todas';
            const fileName = `frases_${yearLabel}_${interaction.channel.name}.txt`;
            const fileContent = allMessages.join('\n');
            fs.writeFileSync(fileName, fileContent);

            const archivoDiscord = new AttachmentBuilder(fileName);
            
            await interaction.editReply({
                content: `✅ ¡Listo! Se extrajeron ${allMessages.length} frases.`,
                files: [archivoDiscord]
            });

            fs.unlinkSync(fileName);

        } catch (error) {
            console.error('Ocurrió un error en la extracción:', error);
            if (interaction.deferred) {
                await interaction.editReply("Ocurrió un error al procesar las frases. Revisa la consola.");
            } else {
                await interaction.reply({ content: "Ocurrió un error al procesar las frases.", ephemeral: true });
            }
        }
    }

    // ---------------------------------------------------------
    // COMANDO 3: EL FILÓSOFO (/citar)
    // ---------------------------------------------------------
    if (commandName === 'citar') {
        const frase = interaction.options.getString('frase');
        const autor = interaction.options.getString('autor');

        await interaction.deferReply(); 

        try {
            // Lienzo negro
            const canvas = createCanvas(800, 400);
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#1e1e1e';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Comillas gigantes de fondo
            ctx.font = 'bold 300px sans-serif';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.fillText('"', 50, 250);

            // Configurar el texto de la frase
            ctx.fillStyle = '#ffffff'; 
            ctx.font = 'italic 40px Arial'; 
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Dividir el texto en renglones
            const maxWidth = 700;
            const lineHeight = 50;
            const words = frase.split(' ');
            let line = '';
            let lines = [];

            for (let n = 0; n < words.length; n++) {
                let testLine = line + words[n] + ' ';
                let metrics = ctx.measureText(testLine);
                let testWidth = metrics.width;
                
                if (testWidth > maxWidth && n > 0) {
                    lines.push(line.trim());
                    line = words[n] + ' ';
                } else {
                    line = testLine;
                }
            }
            lines.push(line.trim());

            // Centrar verticalmente todos los renglones
            let startY = (canvas.height / 2) - ((lines.length * lineHeight) / 2) + (lineHeight / 2) - 20; 
            
            for (let i = 0; i < lines.length; i++) {
                ctx.fillText(lines[i], canvas.width / 2, startY + (i * lineHeight));
            }

            // Nombre del autor
            ctx.font = 'bold 30px Arial';
            ctx.fillStyle = '#a8a8a8';
            ctx.textAlign = 'right';
            ctx.fillText(`— ${autor}`, canvas.width - 50, canvas.height - 40);

            // Exportar a imagen y enviar
            const buffer = canvas.toBuffer('image/png');
            const attachment = new AttachmentBuilder(buffer, { name: 'cita.png' });

            await interaction.editReply({ files: [attachment] });

        } catch (error) {
            console.error('Error al generar la imagen:', error);
            await interaction.editReply('Hubo un error al intentar generar la imagen con Canvas.');
        }
    }
});

client.login(process.env.DISCORD_TOKEN);