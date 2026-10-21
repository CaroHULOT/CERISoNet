
const mongoose = require('mongoose');

const MONGO_URI = 'mongodb://127.0.0.1:27017/db-CERI';

mongoose.connect(MONGO_URI)
    .then(() => console.log('Connecté à MongoDB'))
    .catch(err => console.error('Erreur MongoDB :', err));


//SCHEMA DES POSTS
const postSchema = new mongoose.Schema({
    date: { type: String, required: true },
    hour: { type: String, required: true },
    body: { type: String },
    images: { url: String, title: String }, // Image optionnelle (URL + Titre)
    hashtags: [{ type: String }], // Tableau de tags (ex: ["#Angular", "#JS"])
    createdBy: { type: Number, required: true }, // ID PostgreSQL de l'auteur
    likes: { type: Number, default: 0 },
    likedBy: [{ type: Number }], // IDs des utilisateurs ayant liké
    comments: [{
        text: String,
        commentedBy: Number, // ID PostgreSQL du commenteur
        date: String,
        hour: String
    }],
    shared: { type: String, default: null } // Contient l'ID du post original si partage
}, { collection: 'CERISoNet' });

const Post = mongoose.model('Post', postSchema);

module.exports = { mongoose, Post };
