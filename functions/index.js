const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const cors = require('cors')({ origin: true });
const ExcelJS = require('exceljs');
const multer = require('multer');
const Busboy = require('busboy');
const os = require('os');
const path = require('path');
const fs = require('fs');

admin.initializeApp();
const db = admin.firestore();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'invitationheavensound@gmail.com',
        pass: 'cxvq otoh dfgr wrky',
    },
    tls: {
        rejectUnauthorized: false,
    }
});

exports.registerUser = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        if (req.method === 'OPTIONS') {
            return res.status(200).send();
        }

        const { email, name, firstname, phone, invitations } = req.body;

        if (!email || !name || !firstname || !phone || !invitations) {
            return res.status(400).send('Tous les champs sont obligatoires.');
        }

        if (invitations < 1 || invitations > 5) {
            return res.status(400).send('Vous pouvez demander entre 1 et 5 invitations.');
        }

        try {
            const usersRef = db.collection('users');

            const existingUserQuery = await usersRef.where('email', '==', email).get();
            if (!existingUserQuery.empty) {
                return res.status(400).send('Cet email est déjà utilisé pour une inscription.');
            }

            const eventDoc = await db.collection('event').doc('invitations').get();

            if (!eventDoc.exists) {
                console.log("Document 'invitations' inexistant, création avec valeurs par défaut.");
                await db.collection('event').doc('invitations').set({
                    remaining: 400, 
                });
            }

            let invitationsRemaining = eventDoc.exists ? eventDoc.data().remaining : 400;

            console.log("Invitations restantes avant inscription :", invitationsRemaining);

            if (invitationsRemaining <= 0) {
                return res.status(400).send("Le nombre total d'invitations est atteint.");
            }
            if (invitations > invitationsRemaining) {
                return res.status(400).send(`Il n'y a plus que ${invitationsRemaining} invitations restantes.`);
            }

            const userRef = await usersRef.add({ email, name, firstname, phone, invitations });

            await db.collection('event').doc('invitations').update({
                remaining: admin.firestore.FieldValue.increment(-invitations)
            });

            let ticketId = `ticket_${userRef.id}`;

            let qrData = `🎟️ INVITATION HEAVEN SOUND 🎟️
-----------------------------
👤 Nom: ${name}
👤 Prénom: ${firstname}
📧 Email: ${email}
📞 Téléphone: ${phone}
🎫 Invitations: ${invitations}
🆔 Ticket ID: ${ticketId}
-----------------------------
📍 Lieu: Rex Andohan'Analakely
📅 Date: 26 avril 2025
⏰ Heure: 10h30
-----------------------------
🙏 Merci et à bientôt !`.trim();

            let qrBuffer = await QRCode.toBuffer(qrData, { scale: 20 });

            const imageUrl = "https://firebasestorage.googleapis.com/v0/b/testcloud-7de43.firebasestorage.app/o/HEAVEN%20SOUND%20FINALE%20TENA%20FINALE.png?alt=media&token=18a91e07-7207-4d13-9c9a-110f074cbbc5";

            const mailOptions = {
                from: 'invitationheavensound@gmail.com',
                to: email,
                subject: ' Votre invitation avec QR Code',
                html: `
                    <p>Bonjour ${firstname},</p>
                    <p>Nous sommes très ravis que tu aies décidé de venir adorer le Seigneur avec nous.</p>
                    <p>Pour confirmation, voici les détails de notre prochain rendez-vous :</p>
                    <ul>
                        <li><strong>Date :</strong> 26 avril 2025</li>
                        <li><strong>Heure :</strong> 10h30</li>
                        <li><strong>Lieu :</strong> Rex Andohan'Analakely</li>
                    </ul>
                    <p>Tu as commandé <strong>${invitations}</strong> invitation(s).<br>
                    Grâce à cela, toi et les personnes que tu invites aurez chacun une place réservée.</p>
                    <p><strong>N'oublie surtout pas de télécharger ton QR code et de le présenter à l'entrée.</strong> Une personne sympathique s'occupera de le vérifier et vous conduira à vos places.</p>
                    <p><strong>Nous commencerons à 10h30, alors veille à arriver à l'heure !</strong> En cas de retard et si la salle est complète, ta place pourrait être attribuée à quelqu'un d'autre.</p>
                    <p>Hâte de te voir !<br><strong>Sois béni(e).</strong></p>
                    <p><strong>Heaven Sound</strong></p>
                    <img src="${imageUrl}" width="50">
                `,
                attachments: [
                    {
                        filename: `Invitation.png`,
                        content: qrBuffer,
                        encoding: 'base64'
                    }
                ]
            };
            await transporter.sendMail(mailOptions);

            const mailOptionsAdmin = {
                from: 'invitationheavensound@gmail.com',
                to: 'invitationheavensound@gmail.com',
                subject: 'Nouvelle inscription',
                html: `<p>Un nouvel utilisateur s'est inscrit :</p>
                       <p><strong>Nom :</strong> ${name}</p>
                       <p><strong>Prénom :</strong> ${firstname}</p>
                       <p><strong>Email :</strong> ${email}</p>
                       <p><strong>Contact :</strong> ${phone}</p>
                       <p><strong>Nombre d'invitations :</strong> ${invitations}</p>`
            };
            await transporter.sendMail(mailOptionsAdmin);

            console.log(`Inscription réussie pour ${email} - Invitations restantes après mise à jour :`, invitationsRemaining - invitations);

            return res.status(200).send("Inscription réussie, email envoyé !");
        } catch (error) {
            console.error("Erreur :", error);
            return res.status(500).send("Erreur lors de l'inscription.");
        }
    });
});

exports.addInvitations = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        if (req.method !== 'POST') return res.status(405).send('Méthode non autorisée.');

        const { email, invitations } = req.body;
        if (!email || !invitations) return res.status(400).send('Email et invitations requis.');
        if (invitations < 1 || invitations > 5) return res.status(400).send('Nombre d\'invitations incorrect.');

        try {
            const userSnapshot = await db.collection('users').where('email', '==', email).get();
            if (userSnapshot.empty) return res.status(404).send('Utilisateur non trouvé.');

            const userDoc = userSnapshot.docs[0];
            const userData = userDoc.data();
            const { firstname, name, phone } = userData;

            const totalInvitations = (userData.invitations || 0) + invitations;

            const eventDoc = await db.collection('event').doc('invitations').get();
            if (!eventDoc.exists) return res.status(500).send("Données d'événement non trouvées.");

            let availableInvitations = eventDoc.data().remaining;
            if (availableInvitations < invitations) {
                return res.status(400).send(`Il reste seulement ${availableInvitations} invitations.`);
            }

            await userDoc.ref.update({
                invitations: admin.firestore.FieldValue.increment(invitations)
            });

            await db.collection('event').doc('invitations').update({
                remaining: admin.firestore.FieldValue.increment(-invitations)
            });

            let ticketId = `ticket_${userDoc.ref.id}`;

            let qrData = `🎟️ INVITATION HEAVEN SOUND 🎟️
-----------------------------
👤 Nom: ${name}
👤 Prénom: ${firstname}
📧 Email: ${email}
📞 Téléphone: ${phone}
🎫 Invitations: ${totalInvitations} 
🆔 Ticket ID: ${ticketId}
-----------------------------
📍 Lieu: Rex Andohan'Analakely
📅 Date: 26 avril 2025
⏰ Heure: 10h30
-----------------------------
🙏 Merci et à bientôt !`.trim();

            let qrBuffer = await QRCode.toBuffer(qrData, { scale: 20 });

            const mailOptions = {
                from: 'invitationheavensound@gmail.com',
                to: email,
                subject: 'Vos nouvelles invitations',
                html: `<p>Bonjour ${firstname},</p>
                       <p>Vous avez demandé ${invitations} invitations supplémentaires.</p>
                       <p>Total d'invitations : ${totalInvitations}</p>
                       <p>Veuillez seulement présenter ce dernier QR code à l'entrée.</p>`,
                attachments: [
                    {
                        filename: `NouvellesInvitations.png`,
                        content: qrBuffer,
                        encoding: 'base64'
                    }
                ]
            };

            await transporter.sendMail(mailOptions);
            res.setHeader('Content-Type', 'application/json');
            return res.status(200).send("Invitations supplémentaires enregistrées et email envoyé.");
        } catch (error) {
            console.error("Erreur lors de l'ajout d'invitations:", error);
            return res.status(500).send("Erreur interne.");
        }
    });
});

exports.exportToExcel = functions.https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            const usersRef = db.collection('users');
            const usersSnapshot = await usersRef.get();

            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Utilisateurs');
            worksheet.columns = [
                { header: 'Email', key: 'email', width: 30 },
                { header: 'Nom', key: 'name', width: 30 },
                { header: 'Prenom', key: 'firstname', width: 30 },
                { header: 'Contact', key: 'phone', width: 30 },
                { header: 'Invitations', key: 'invitations', width: 15 },
            ];

            let totalInvitations = 0;

            usersSnapshot.forEach(doc => {
                const userData = doc.data();
                worksheet.addRow({
                    email: userData.email,
                    name: userData.name,
                    firstname: userData.firstname,
                    phone: userData.phone,
                    invitations: userData.invitations,
                });

                totalInvitations += userData.invitations;
            });

            worksheet.addRow({
                email: '',
                name: 'Total Invitations',
                firstname: '',
                phone: '',
                invitations: totalInvitations,
            });

            const buffer = await workbook.xlsx.writeBuffer();

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=export_utilisateurs.xlsx');
            res.send(buffer);
        } catch (error) {
            console.error('Erreur lors de l\'export :', error);
            res.status(500).send('Erreur lors de l\'export des données.');
        }
    });
});

exports.importFromExcel = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        if (req.method !== 'POST') {
            return res.status(405).send('Méthode non autorisée');
        }
        
        try {
            const busboy = Busboy({ headers: req.headers });
            const tmpdir = os.tmpdir();
            const fields = {};
            const fileWrites = [];
            let filePath = ''; 

            const fileData = await new Promise((resolve, reject) => {
                busboy.on('field', (fieldname, val) => {
                    fields[fieldname] = val;
                });

                busboy.on('file', (fieldname, file, { filename }) => {
                    if (fieldname !== 'file') {
                        file.resume();
                        return;
                    }

                    console.log(`Traitement du fichier: ${filename}`);
                    filePath = path.join(tmpdir, filename);
                    const writeStream = fs.createWriteStream(filePath);
                    file.pipe(writeStream);

                    fileWrites.push(new Promise((resolve, reject) => {
                        writeStream.on('finish', resolve);
                        writeStream.on('error', reject);
                    }));
                });

                busboy.on('error', reject);
                busboy.on('finish', async () => {
                    try {
                        await Promise.all(fileWrites);
                        resolve({ filePath, fields });
                    } catch (error) {
                        reject(error);
                    }
                });

                busboy.end(req.rawBody);
            });

            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(fileData.filePath);
            const worksheet = workbook.worksheets[0];
            const rows = [];

            worksheet.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return; 

                const email = row.getCell(1).value?.toString() || '';
                const name = row.getCell(2).value?.toString() || '';
                const firstname = row.getCell(3).value?.toString() || '';
                const phone = row.getCell(4).value?.toString() || '';
                const invitations = parseInt(row.getCell(5).value?.toString() || 0);

                if (email && name && firstname) {
                    rows.push({
                        email,
                        name,
                        firstname,
                        phone,
                        invitations: isNaN(invitations) ? 0 : invitations
                    });
                }
            });

            fs.unlinkSync(fileData.filePath);

            if (rows.length === 0) {
                return res.status(400).send('Aucune donnée valide trouvée dans le fichier');
            }

            const batch = db.batch();
            let totalInvitations = 0;
            const eventRef = db.collection('event').doc('invitations');
            
            const eventDoc = await eventRef.get();
            if (!eventDoc.exists) {
                batch.set(eventRef, { remaining: 400 });
                console.log("Document 'event/invitations' créé avec 400 invitations initiales");
            }

            rows.forEach(user => {
                const docRef = db.collection('users').doc();
                batch.set(docRef, user);
                totalInvitations += user.invitations;
            });

            batch.update(eventRef, {
                remaining: admin.firestore.FieldValue.increment(-totalInvitations)
            });

            await batch.commit();

            return res.status(200).json({
                success: true,
                message: `Importation réussie !`,
                details: {
                    usersAdded: rows.length,
                    invitationsUsed: totalInvitations
                }
            });

        } catch (error) {
            console.error('Erreur lors de l\'importation:', error);
            return res.status(500).json({
                success: false,
                message: 'Erreur lors de l\'importation',
                error: error.message
            });
        }
    });
});

exports.sendEmailToAll = functions.https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        if (req.method !== 'POST') {
            return res.status(405).send('Méthode non autorisée.');
        }

        try {
            const usersRef = db.collection('users');
            const usersSnapshot = await usersRef.get();

            if (usersSnapshot.empty) {
                return res.status(404).send('Aucun utilisateur trouvé.');
            }

            const smallImageUrl = "https://firebasestorage.googleapis.com/v0/b/testcloud-7de43.firebasestorage.app/o/HEAVEN%20SOUND%20FINALE%20TENA%20FINALE.png?alt=media&token=18a91e07-7207-4d13-9c9a-110f074cbbc5";
            const largeImageUrl = "https://firebasestorage.googleapis.com/v0/b/testcloud-7de43.firebasestorage.app/o/2.jpg?alt=media&token=fb912e30-4bb4-4fb4-99de-21b72019d3f2";
            const registrationLink = "https://www.heavensound.mg/inscription";

            const emailPromises = [];

            usersSnapshot.forEach((doc) => {
                const userData = doc.data();
                const mailOptions = {
                    from: 'invitationheavensound@gmail.com',
                    to: userData.email,
                    subject: 'Ne manquez pas notre prochain événement !',
                    html: `
                        <p>Bonjour ${userData.firstname},</p>
                        <p>Nous sommes ravis de vous inviter à notre prochain événement !</p>
                        <p>Voici les détails :</p>
                        <ul>
                            <li><strong>Date :</strong> 26 avril 2025</li>
                            <li><strong>Heure :</strong> 10h30</li>
                            <li><strong>Lieu :</strong> Rex Andohan'Analakely</li>
                        </ul>

                        <!-- Nouvelle image en grand plan -->
                        <img src="${largeImageUrl}" width="100%" style="max-width: 400px; height: auto; margin-top: 20px;">

                        <p>Nous espérons vous voir nombreux pour célébrer le nom de Jésus ensemble !</p>

                        <p>Réservez votre place dès maintenant en cliquant sur ce lien : 
                        <a href="${registrationLink}" target="_blank" style="font-weight: bold; color: blue;">S'inscrire et obtenir mon QR code</a>
                        </p>

                        <p>Partagez ce lien avec vos amis et votre famille afin qu'ils puissent également obtenir leur QR code et assister à cet événement exceptionnel !</p>

                        <p><strong>Heaven Sound</strong></p>
                        
                        <!-- Petite image -->
                        <img src="${smallImageUrl}" width="50" style="margin-bottom: 20px;">
                    `,
                };

                emailPromises.push(transporter.sendMail(mailOptions));
            });

            await Promise.all(emailPromises);

            const confirmationMailOptions = {
                from: 'invitationheavensound@gmail.com',
                to: 'invitationheavensound@gmail.com',
                subject: 'Confirmation d\'envoi des invitations',
                html: `
                    <p>Bonjour,</p>
                    <p>Tous les emails d'invitation ont été envoyés avec succès à tous les utilisateurs.</p>
                    <p>Cordialement,</p>
                    <p><strong>Heaven Sound</strong></p>
                `,
            };
            await transporter.sendMail(confirmationMailOptions);

            return res.status(200).send('Emails envoyés avec succès à tous les utilisateurs et confirmation envoyée.');
        } catch (error) {
            console.error('Erreur lors de l\'envoi des emails :', error);
            return res.status(500).send('Erreur lors de l\'envoi des emails.');
        }
    });
});

exports.deleteAllData = functions.https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        if (req.method !== 'POST') {
            return res.status(405).send('Méthode non autorisée');
        }

        try {
            const usersRef = db.collection('users');
            const usersSnapshot = await usersRef.get();
            
            const batch = db.batch();
            usersSnapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
            
            const eventRef = db.collection('event').doc('invitations');
            batch.delete(eventRef);

            await batch.commit();

            return res.status(200).json({
                success: true,
                message: 'Toutes les données ont été supprimées avec succès'
            });

        } catch (error) {
            console.error('Erreur lors de la suppression:', error);
            return res.status(500).json({
                success: false,
                message: 'Erreur lors de la suppression des données',
                error: error.message
            });
        }
    });
});

exports.redirectToMaintenance = functions.https.onRequest((req, res) => {
    const allowedIP = "102.17.45.51";
    const clientIP = req.headers["x-forwarded-for"] || req.connection.remoteAddress;

    if (clientIP !== allowedIP) {
        res.redirect("/maintenance.html");
    } else {
        res.redirect("/");
    }
});