const express = require('express');
const fs = require('fs');
const https = require('https');

const app = express();
app.use(express.json());

const PORT_HTTP = 3108;
const PORT_HTTPS = 3109;

//------------------------EXO 1----------------------------


// SSL
const SSLOptions = {
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem')
};

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.htm');
});

var serverhttp = app.listen(PORT_HTTP, () => {
    console.log(`HTTP Server running on port ${PORT_HTTP}`);
});

var serverhttps = https.createServer(SSLOptions, app).listen(PORT_HTTPS, () => {
    console.log(`HTTPS Server running on port ${PORT_HTTPS}`);
});


//------------------------EXO 2----------------------------

app.get('/produit/:nom/:stock', (request, response) => {
    var nomRecu = request.params.nom;
    var stockRecu = request.params.stock;
    response.json({ nom: nomRecu, stock: stockRecu });
});

// curl -X POST -H "Content-Type: application/json" -d '{"nom":"table", "stock":4}' http://pedago.univ-avignon.fr:3108/produit
app.post('/produit', (request, response) => {
    var nomRecu = request.body.nom;
    var stockRecu = request.body.stock;

    console.log("Données reçues : ", nomRecu, stockRecu);

    response.json({
        message: "Produit bien reçu via POST !",
        nom: nomRecu,
        stock: stockRecu
    });
});

//------------------------EXO 3----------------------------

// 1. Test de redirection 308 (Permanent Redirect)
app.get('/test-redirection', (req, res) => {
    console.log('Redirection en cours...');
    res.redirect(308, '/');
});

// 2. Test erreur 404 (Not Found)
app.get('/erreur-404', (req, res) => {
    res.status(404).send("Erreur 404 : Ressource introuvable");
});

// 3. Test erreur 401 (Unauthorized - Accès refusé)
app.get('/erreur-401', (req, res) => {
    res.status(401).json({
        error: "Unauthorized",
        message: "Vous devez être connecté pour accéder à cette ressource."
    });
});

// 4. Test erreur 503 (Service Unavailable)
app.get('/erreur-503', (req, res) => {
    res.status(503).send("Service temporairement indisponible.");
});

// 5. Test erreur 502 (Bad Gateway)
app.get('/erreur-502', (req, res) => {
    res.status(502).send("Bad Gateway.");
});





