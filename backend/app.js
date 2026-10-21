const express = require('express');
const fs = require('node:fs');
const https = require('node:https');
const crypto = require('node:crypto');
const session = require('express-session');
const MongoDBStore = require('connect-mongodb-session')(session);
const socketIo = require('socket.io');
const db = require('./db');
const { Post } = require('./db_mongo');

const app = express();
const PORT_HTTPS = 3108;

// Middlewares pour parser les requêtes JSON/formulaires
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 *STORE DE SESSION (MongoDB)
 * Permet de conserver les sessions.
 */
const store = new MongoDBStore({
    uri: 'mongodb://127.0.0.1:27017/',
    collection: 'MySession3109',
    touchAfter: 24 * 3600
});

//middleware de session
const sessionMiddleware = session({
    secret: 'ma phrase secrete',
    saveUninitialized: false,
    resave: false,
    store: store,
    cookie: { maxAge: 24 * 3600 * 1000 } //valide 24h
});

app.use(sessionMiddleware);

//HTTPS

const SSLOptions = {
    key: fs.readFileSync('certs/key.pem'),
    cert: fs.readFileSync('certs/cert.pem')
};

const httpsServer = https.createServer(SSLOptions, app);

//CONF WEBSOCKET (Socket.io)
const io = socketIo(httpsServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

/**
 * PARTAGE DE LA SESSION AVEC SOCKET.IO
 * Permet d'identifier l'utilisateur (userId, pseudo) même via WebSocket.
 */
io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});

/**
 * GESTION EVENEMENTS WEBSOCKET
 */
io.on('connection', (socket) => {
    const session = socket.request.session;
    if (session && session.pseudo) {
        console.log(`Socket connecté pour: ${session.pseudo}`);
    }

    /**
     * DECONNEXION WEBSOCKET
     * Maj statut et prévient tout le monde.
     */
    socket.on('disconnect', async () => {
        const sessionID = socket.request.sessionID;
        if (sessionID) {
            store.get(sessionID, async (err, sessionData) => {
                if (!err && sessionData && sessionData.userId) {
                    console.log(`Socket déconnecté pour: ${sessionData.pseudo}`);
                    try {
                        // Maj SQL => "En Ligne"
                        await db.query('UPDATE fredouil.compte SET statut_connexion = 0 WHERE id = $1', [sessionData.userId]);
                        io.emit('userStatusChange'); // On signale changement
                    } catch (e) {
                        console.error("Erreur disconnect SQL", e);
                    }
                }
            });
        }
    });

    /**
     * PARTAGE DE POST
     * Crée un nouveau post "miroir" lié au post original.
     */
    socket.on('sharePost', async (data, callback) => {
        console.log(` Requête de partage reçue pour le post: ${data.originalPostId}`);
        const sessionID = socket.request.sessionID;

        if (!sessionID) {
            if (callback) callback({ error: "Session non identifiée" });
            return;
        }

        // Récupération de la session depuis le store
        store.get(sessionID, async (err, sessionData) => {
            if (err || !sessionData || !sessionData.isConnected) {
                if (callback) callback({ error: "Non connecté" });
                return;
            }

            try {
                // On récupère le post original
                const originalPost = await Post.findById(data.originalPostId);

                const now = new Date();
                const sharedPost = new Post({
                    date: now.toISOString().split('T')[0],
                    hour: now.toTimeString().slice(0, 5),
                    body: data.comment,
                    createdBy: sessionData.userId,
                    shared: data.originalPostId,
                    likes: 0,
                    likedBy: [],
                    comments: [],
                    hashtags: [],
                    images: (originalPost && originalPost.images && originalPost.images.url) ? originalPost.images : undefined
                });

                const saved = await sharedPost.save();
                const resp = saved.toObject();
                resp.pseudo = sessionData.pseudo;

                const norm = normalizeDateTime(resp.date, resp.hour);

                io.emit('postCreated', { ...resp, ...norm });
                broadcastNotification(`${sessionData.pseudo} a partagé un post !`);

                if (callback) callback({ success: true, postId: saved._id });
            } catch (err) {
                console.error("Erreur lors du partage WebSocket", err);
                if (callback) callback({ error: "Erreur serveur lors du partage" });
            }
        });
    });
});

function broadcastNotification(message) {
    io.emit('notification', message);
}

//PostgreSQL
app.post('/login', (req, res) => {
    const { login, password } = req.body;
    if (!login || !password) return res.status(400).json({ error: "Login et mot de passe requis" });

    // Hachage SHA1
    const hashedPassword = crypto.createHash('sha1').update(password).digest('hex');
    const query = 'SELECT * FROM fredouil.compte WHERE mail = $1 AND motpasse = $2';

    db.query(query, [login, hashedPassword], async (err, result) => {
        if (err) return res.status(500).json({ error: "Erreur serveur" });

        if (result.rows.length > 0) {
            const user = result.rows[0];
            req.session.isConnected = true;
            req.session.userId = user.id;
            req.session.pseudo = user.pseudo;

            try {
                //=>statut à 1 
                await db.query('UPDATE fredouil.compte SET statut_connexion = 1 WHERE id = $1', [user.id]);
                broadcastNotification(`Connexion de ${user.pseudo}`);
                io.emit('userStatusChange');
            } catch (e) {
                console.error("Erreur update statut_connexion", e);
            }

            delete user.motpasse; // renvoie pas le mdp
            res.status(200).json(user);
        } else {
            res.status(401).json({ error: "Identifiants invalides" });
        }
    });
});

//DECONNEXION
app.post('/logout', async (req, res) => {
    const userId = req.session?.userId;
    const pseudo = req.session?.pseudo;

    if (userId) {
        try {
            await db.query('UPDATE fredouil.compte SET statut_connexion = 0 WHERE id = $1', [userId]);
            if (pseudo) {
                broadcastNotification(`${pseudo} s'est déconnecté`);
            }
            io.emit('userStatusChange');
        } catch (err) {
            console.error("Erreur logout SQL", err);
        }
    }

    if (req.session) {
        req.session.destroy(); // Destruction de la session dans MongoDB
    }
    res.status(200).json({ message: "Déconnecté" });
});

/**
 * MIDDLEWARE
 * Vérifie si l'utilisateur est connecté avant d'autoriser l'accès aux API.
 */
function isAuthenticated(req, res, next) {
    if (req.session && req.session.isConnected) return next();
    return res.status(401).json({ error: 'Non authentifié' });
}

/**
 * NORMALISATION DES DATES 
 * Transforme les formats en JJ/MM/AAAA.
 */
function normalizeDateTime(dateStr, hourStr) {
    try {
        if (!dateStr) return { date: 'Date inconnue', hour: '' };
        dateStr = String(dateStr).trim();
        hourStr = hourStr ? String(hourStr).trim() : '';

        let combined = dateStr;
        if (hourStr && !dateStr.includes(hourStr)) combined = `${dateStr} ${hourStr}`;

        let parsed = new Date(combined);
        if (isNaN(parsed.getTime()) && hourStr) parsed = new Date(dateStr);

        if (!isNaN(parsed.getTime())) {
            return {
                date: `${String(parsed.getDate()).padStart(2, '0')}/${String(parsed.getMonth() + 1).padStart(2, '0')}/${parsed.getFullYear()}`,
                hour: `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`
            };
        }
        return { date: dateStr, hour: hourStr || '' };
    } catch (e) {
        return { date: dateStr, hour: hourStr || '' };
    }
}

/**
 * RECUPERATION DES POSTS 
 * Gère la pagination, le tri (date, likes) et le filtrage (hashtag, auteur).
 */
app.get('/posts', isAuthenticated, async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;

        // Configuration du tri
        const sortField = ['date', 'likes', 'createdBy'].includes(req.query.sortBy)
            ? (req.query.sortBy === 'date' ? '_id' : req.query.sortBy) : '_id';
        const sortOrder = req.query.order === 'asc' ? 1 : -1;

        // Construction du filtre
        const filter = {};
        if (req.query.createdBy) filter.createdBy = parseInt(req.query.createdBy);
        if (req.query.hashtag) filter.hashtags = req.query.hashtag;

        const [postsRaw, total] = await Promise.all([
            Post.find(filter).sort({ [sortField]: sortOrder }).skip(skip).limit(limit).lean(),
            Post.countDocuments(filter)
        ]);

        //Pour chaque post MongoDB, on va chercher le pseudo de l'auteur dans PostgreSQL.
        const allUserIds = [];
        postsRaw.forEach(p => {
            allUserIds.push(p.createdBy);
            if (p.comments) p.comments.forEach(c => allUserIds.push(c.commentedBy));
        });

        const userInfoMap = {};
        const uniqueUserIds = [...new Set(allUserIds)];
        if (uniqueUserIds.length > 0) {
            const sqlRes = await db.query('SELECT id, pseudo, avatar FROM fredouil.compte WHERE id = ANY($1)', [uniqueUserIds]);
            sqlRes.rows.forEach(r => userInfoMap[r.id] = { pseudo: r.pseudo, avatar: r.avatar });
        }

        // Assemblage des données pour le front
        const posts = postsRaw.map(p => {
            const { date, hour } = normalizeDateTime(p.date, p.hour);
            const normalizedComments = (p.comments || []).map(c => {
                const cNorm = normalizeDateTime(c.date, c.hour);
                const info = userInfoMap[c.commentedBy] || {};
                return {
                    ...c,
                    ...cNorm,
                    pseudo: info.pseudo || `Auteur_${c.commentedBy}`,
                    avatar: info.avatar || null
                };
            });

            const info = userInfoMap[p.createdBy] || {};
            return {
                ...p,
                date,
                hour,
                pseudo: info.pseudo || `Auteur_${p.createdBy}`,
                avatar: info.avatar || null,
                comments: normalizedComments,
                hashtags: Array.isArray(p.hashtags) ? p.hashtags : [],
                likes: Array.isArray(p.likes) ? p.likes.length : (p.likes || 0),
                images: Array.isArray(p.images) ? p.images[0] : p.images
            };
        });

        res.status(200).json({ posts, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
    } catch (err) {
        res.status(500).json({ error: 'Erreur récupération posts' });
    }
});

/**
 * AJOUT D'UN COMMENTAIRE
 */
app.post('/posts/:id/comment', isAuthenticated, async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ error: 'Texte requis' });

        const now = new Date();
        const newComment = {
            text: text,
            commentedBy: req.session.userId,
            date: now.toISOString().split('T')[0],
            hour: now.toTimeString().slice(0, 5)
        };

        const result = await Post.findByIdAndUpdate(
            req.params.id,
            { $push: { comments: newComment } },
            { new: true }
        );

        if (!result) return res.status(404).json({ error: 'Post introuvable' });

        const norm = normalizeDateTime(newComment.date, newComment.hour);
        res.status(201).json({
            message: 'Commentaire posté',
            comment: { ...newComment, ...norm, pseudo: req.session.pseudo }
        });

        // Alerte WebSocket 
        io.emit('commentAdded', { postId: req.params.id, comment: { ...newComment, ...norm, pseudo: req.session.pseudo } });
        broadcastNotification(`${req.session.pseudo} a commenté un post`);
    } catch (err) {
        res.status(500).json({ error: 'Erreur commentaire' });
    }
});

/**
 * GESTION DES LIKES
 */
app.put('/posts/:id/like', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId;
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ error: 'Post introuvable' });

        const likedBy = Array.isArray(post.likedBy) ? post.likedBy : [];
        const index = likedBy.indexOf(userId);

        if (index === -1) {
            // Ajout du like
            await Post.findByIdAndUpdate(req.params.id, {
                $push: { likedBy: userId },
                $inc: { likes: 1 }
            });
            res.json({ liked: true, count: post.likes + 1 });
            io.emit('likeUpdated', { postId: req.params.id, likes: post.likes + 1 });
        } else {
            // Retrait du like
            await Post.findByIdAndUpdate(req.params.id, {
                $pull: { likedBy: userId },
                $inc: { likes: -1 }
            });
            res.json({ liked: false, count: post.likes - 1 });
            io.emit('likeUpdated', { postId: req.params.id, likes: post.likes - 1 });
        }
    } catch (err) {
        res.status(500).json({ error: 'Erreur like' });
    }
});

/**
 * PUBLICATION DE POST 
 */
app.post('/publish', isAuthenticated, async (req, res) => {
    try {
        const { body, hashtags, images } = req.body;
        if (!body) return res.status(400).json({ error: 'Body requis' });

        const now = new Date();
        const newPost = new Post({
            date: now.toISOString().split('T')[0],
            hour: now.toTimeString().slice(0, 5),
            body,
            createdBy: req.session.userId,
            likes: 0,
            likedBy: [],
            hashtags: Array.isArray(hashtags) ? hashtags : [],
            images: (images && images.url) ? images : undefined,
            comments: [],
            shared: null
        });

        const saved = await newPost.save();
        const resp = saved.toObject();
        resp.pseudo = req.session.pseudo;
        const norm = normalizeDateTime(resp.date, resp.hour);
        res.status(201).json({ ...resp, ...norm });

        io.emit('postCreated', { ...resp, ...norm });
        broadcastNotification(`${req.session.pseudo} a publié un nouveau post`);
    } catch (err) {
        res.status(500).json({ error: 'Erreur publication' });
    }
});

/**
 * MISE A JOUR AVATAR 
 */
app.put('/update-avatar', isAuthenticated, async (req, res) => {
    try {
        const { url } = req.body;
        const userId = req.session.userId;
        if (!url) return res.status(400).json({ error: "URL d'avatar requise" });

        const query = 'UPDATE fredouil.compte SET avatar = $1 WHERE id = $2';
        await db.query(query, [url, userId]);
        res.status(200).json({ message: "Avatar mis à jour", url });
    } catch (err) {
        res.status(500).json({ error: "Erreur serveur" });
    }
});

/**
 * LISTE DES UTILISATEURS EN LIGNE
 */
app.get('/users/online', isAuthenticated, async (req, res) => {
    try {
        const sqlRes = await db.query('SELECT pseudo FROM fredouil.compte WHERE statut_connexion = 1');
        let online = sqlRes.rows.map(r => r.pseudo);
        // Sécurité : S'assurer que soi-même on y est
        if (req.session.pseudo && !online.includes(req.session.pseudo)) online.push(req.session.pseudo);
        res.json(online);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// LANCEMENT DU SERVEUR
httpsServer.listen(PORT_HTTPS, () => {
    console.log(`🚀 SERVEUR CERISoNet lancé sur : https://pedago.univ-avignon.fr:${PORT_HTTPS}`);
});

