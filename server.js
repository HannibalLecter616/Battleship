var express = require('express');
var http = require('http');
var ejs = require('ejs');
var socketio = require('socket.io');
var bodyParser = require('body-parser');

var app = express();
app.set('view engine', 'ejs');

var mongoUtils = require('./mongoUtils');
var User = require('./model/User');

var server = http.Server(app);
var io = socketio(server);
const bcrypt = require("bcryptjs");

var BattleShip = require('./app/Game');

const PORT = 3000;

server.listen(PORT, function () {
   console.log('Server is running');
});

var users = {};
var actual_user = [];
var collections;
var gameCount = 1;
var ready = [];
var bothReady = false;


app.set('views', __dirname + '/views');

mongoUtils.conectToServer(function () {
   console.log("Listening on port 3000");
});


app.use(bodyParser.urlencoded({
   extended: true
}));

app.use(bodyParser.json());

app.get('/', (req, res) => {
   res.sendFile(__dirname + "/views" + '/welcome.html');
});

app.get('/register', (req, res) => {
   res.sendFile(__dirname + "/views" + '/register.html');
});

app.get('/login', (req, res) => {
   res.sendFile(__dirname + "/views" + '/login.html');
});

app.get('/game', (req, res) => {
   var name = req.query.user_name;
   var id = req.query.user_id;
   var ships = [{
         'type': 'Aircraft carrier',
         'size': 5,
         'location': [],
         'hits': 0,
         'amount': 1,
         'image': 'https://images.vexels.com/media/users/3/166189/isolated/lists/606bbbaf01571d08eec77ff638eb2a6b-cargo-ship-silhouette.png'
      },
      {
         'type': 'Battleship',
         'size': 4,
         'location': [],
         'hits': 0,
         'amount': 1,
         'image': 'https://cdn0.iconfinder.com/data/icons/military-5/512/b77_1-512.png'
      },
      {
         'type': 'Submarine',
         'size': 3,
         'location': [],
         'hits': 0,
         'amount': 1,
         'image': 'https://cdn0.iconfinder.com/data/icons/military-5/512/b77_3-512.png'
      },
      {
         'type': 'Destroyer',
         'size': 2,
         'location': [],
         'hits': 0,
         'amount': 1,
         'image': 'https://cdn3.iconfinder.com/data/icons/war-6/512/b135_7-512.png'
      }
   ];

   var matrix = [];
   for (var i = 0; i < 10; i++) {
      matrix[i] = [];
      for (var j = 0; j < 10; j++) {
         matrix[i][j] = 0;
      }
   }

   var dados = {
      "name": name,
      "id": id,
      "matrix": matrix
   }

   collections = mongoUtils.getDriver();
   collections.collection('games').insertOne(dados);

   res.render('game', {
      name: name,
      id: id,
      ships: ships,
   });
})

app.get('/mygames', (req, res) => {
   res.sendFile(__dirname + "/views" + '/mygames.html');
})

io.on('connection', (socket) => {
   console.log('Someone joined the server');
   //console.log(users);

   socket.join('espera');

   socket.on('join', function () {

      console.log(io.sockets.adapter.rooms['espera']);

      users[socket.id] = {
         jogo: null,
         numero: null
      };

      // users[socket.id] = nome;
      // console.log(users[socket.id]+' joined the chatroom'); 
      // console.log(users);
      // console.log(io.sockets.adapter.rooms['waiting players']);
      var players = getGamersWaiting('espera');

      console.log(players.length);

      if (players.length >= 2) {

         var game = new BattleShip(gameCount++, players[0].id, players[1].id);

         //console.log(game.players);

         players[0].leave('espera');
         players[1].leave('espera');

         players[0].join('game' + game.id);
         players[1].join('game' + game.id);

         users[players[0].id].numero = 0;
         users[players[0].id].jogo = game;
         users[players[1].id].numero = 1;
         users[players[1].id].jogo = game;
         //console.log(players[0]);

         io.to('game' + game.id).emit('start', game.id);
         console.log(io.sockets.adapter.rooms['game' + game.id]);
      }
      //io.emit('update'," ### "+users[socket.id]+" is prepared for battle  ###");
   });

   socket.on('message', function (message) {

      if (users[socket.id].jogo != null && message) {

         //mostra a mensagem para o utilizador conectado na sala 
         socket.broadcast.to('game' + users[socket.id].jogo.id).emit('message', {
            name: 'Adversario',
            message: message,
         });

         //mostra a mensagem para o utilizador atual, de modo a manter a organizaçao no chat
         io.to(socket.id).emit('message', {
            name: 'Eu',
            message: message,
         });
      }
   });

   socket.on('tiro', function (local) {
      var game = users[socket.id].jogo; // aqui obtens a informação do jogo

      //mudança de turnos quando se da um tiro
      if (game.turno == 0) {

         console.log(game.turno + " tiro efetuado no " + local.x + ' , ' + local.y);
         //se acertar em algum barco.. continua
      
         //se nao acertar muda de turno
         game.turno = 1;

         if (game.turno == users[socket.id].numero) {
            // console.log(socket.id + "pode disparar");
            io.to(socket.id).emit('cant_Fire');
            socket.broadcast.to('game' + users[socket.id].jogo.id).emit('canFire');
         }
         // console.log(game.turno);
      } else if (game.turno == 1) {

         console.log(game.turno + " tiro efetuado no " + local.x + ' , ' + local.y);

         game.turno = 0;

         if (game.turno == users[socket.id].numero) {
            // console.log(socket.id + "pode disparar");
            io.to(socket.id).emit('cant_Fire');
            socket.broadcast.to('game' + users[socket.id].jogo.id).emit('canFire');
         }
      }
   });


   var matriz_sec = [];

   var cells = [];

   socket.on('place', function (coord) {

      cells.push([coord[1], coord[0]]);


      if (cells.length == coord[2]) {
         // Já recebeu todas as células do barco

         collections = mongoUtils.getDriver();

         // console.log(coord[1] + " , " + coord[0]); // x, y

         // collections.collection('games').remove({});

         // Ler matriz da BD aqui
         var teste = collections.collection('games').find({
            id: coord[3]
         }).toArray(function (err, result) {
            if (err)
               throw err;

            matriz_sec = result[0].matrix;

            // console.log("teste" + cells.length);

            for (var i = 0; i < cells.length; i++) {

               matriz_sec[cells[i][0]][cells[i][1]] = 1;

               // console.log("x" + matriz_sec[cells[i][0]][cells[i][1]]);

            }

            collections.collection('games').updateOne({
               id: coord[3]
            }, {
               $set: {
                  matrix: matriz_sec
               }
            });

            cells = [];



         });
      }


   });

   socket.on('pronto', function (id) {
      console.log("Jogador " + id + " está pronto");

      ready.push(id);

      if (ready.length == 2) {
         var bothReady = true;
      }

      if (bothReady) {
         var game = users[socket.id].jogo; // aqui obtens a informação do jogo

         var chooseRandomPlayer = Math.floor(Math.random() * 2); //escolhe um random entre  0 e 1

         game.turno = chooseRandomPlayer;
         //console.log(game);
         if (game.turno == users[socket.id].numero) {

            console.log(game.turno + " " + socket.id + " pode disparar");

            io.to(socket.id).emit('canFire');
            socket.broadcast.to('game' + users[socket.id].jogo.id).emit('cant_Fire');
         } else {
            console.log(game.turno + " " + socket.id + " pode disparar");

            io.to(socket.id).emit('canFire');
            socket.broadcast.to('game' + users[socket.id].jogo.id).emit('cant_Fire');
         }
      }
   });
});

function getGamersWaiting(room) {

   var gamers = [];

   for (var id in io.sockets.adapter.rooms[room].sockets) {
      gamers.push(io.sockets.adapter.nsp.connected[id]);
   }

   return gamers;
}


app.post('/register', function (req, res) {
   var name = req.body.name;
   var email = req.body.email;
   var password = req.body.password;
   var password2 = req.body.password2;

   if (!name || !email || !password) {
      console.log("Incomplete Information");
   } else if (password == password2) {

      bcrypt.hash(password, 8, (err, hashedPassword) => {
         if (err) {
            return err;
         }
         collections = mongoUtils.getDriver();
         var user = collections.collection('users').find({
            email: email
         }).toArray(function (err, result) {
            if (err)
               throw err;;
            //verifica se existe mais algum utilizador com aquele email
            if (!result[0]) {
               var dados = {
                  "name": name,
                  "email": email,
                  "password": hashedPassword,
               }

               collections.collection('users').insertOne(dados);

               res.redirect('/login');
            } else {
               console.log("Utilizador já  registado");
               res.redirect('/register');
            }
         })
      });
   } else {
      console.log("Erro de insercao");
   }
});

app.post('/main', function (req, res) {

   var name = req.body.email;
   var password = req.body.password;

   collections = mongoUtils.getDriver();

   collections.collection('users').find({
      email: name
   }).toArray(function (err, result) {
      if (err)
         throw err;

      if (!result[0]) {
         res.redirect('/login');
      } else {
         // console.log(result[0].password);
         bcrypt.compare(password, result[0].password, (err, isMatch) => {
            //se as palavra passe coincidir com a da base de dados
            if (isMatch) {
               //users.push(result[0]);
               res.render('main', {
                  name: result[0].name,
                  id: result[0]._id
               });
            } else {
               console.log("Invalid Password");
               res.redirect('/login'); // mostrar mensagem de erro - password incorreta
            }
         });
      }
   })
});