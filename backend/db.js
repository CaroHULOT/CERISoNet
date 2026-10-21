// Pour se connecter à la db postgresql
const { Client } = require('pg');

const client = new Client({
    user: 'uapv2306186',
    host: 'localhost',
    database: 'etd',
    password: 'F0t0Z1',
    port: 5432,
});

client.connect()
    .then(() => console.log('Connecté à PostgreSQL '))
    .catch(err => console.error('Erreur de connexion PostgreSQL', err));

module.exports = client;
