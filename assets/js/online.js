/* =========================================================================
   ASSINA EMBAIXO — MODO ONLINE (duelo entre duas equipes)

   Duas equipes de quatro, uma tela por equipe, mesma empresa, mesmas
   perguntas. No fim, o maior placar vence.

   O que trafega pela rede é o mínimo: o nome da equipe, a fase em que ela
   está e o placar final. A EMPRESA NÃO TRAFEGA — ela é derivada do código
   da sala nas duas pontas (companyForRoom), então não há o que sincronizar
   nem o que dessincronizar.

   Este arquivo só é carregado pelo index.html. O assina-embaixo.html
   continua sem rede: se o wi-fi da sala cair, o jogo offline não sabe que
   isto existe.
   ========================================================================= */

(function () {
  "use strict";

  var GAME = window.AssinaEmbaixo;
  if (!GAME) return; /* game.js não carregou: não há o que acoplar */

  var $ = function (s) { return document.querySelector(s); };

  var db = null;
  var room = null;   /* { code, side, ref } */
  var watcher = null;

  /* -----------------------------------------------------------------------
     CONEXÃO
     --------------------------------------------------------------------- */

  function connect() {
    if (db) return db;
    if (!window.firebase || !window.FIREBASE_CONFIG) return null;
    if (!window.firebase.apps.length) window.firebase.initializeApp(window.FIREBASE_CONFIG);
    db = window.firebase.database();
    return db;
  }

  function roomRef(code) { return db.ref("salas/" + code); }

  /* -----------------------------------------------------------------------
     SALA

     Os dois lados são "a" e "b". Quem cria fica com "a"; quem entra tenta
     "b" numa transação, que é o que impede duas equipes de ocuparem a mesma
     vaga quando entram no mesmo segundo.
     --------------------------------------------------------------------- */

  function claimSide(code, side, teamName, done) {
    var ref = roomRef(code).child("equipes/" + side);
    ref.transaction(function (atual) {
      if (atual) return; /* vaga ocupada: aborta sem escrever */
      return { nome: teamName, fase: 0 };
    }, function (err, committed) {
      if (err) return done(erroDeRede(err));
      if (!committed) return done("vaga-ocupada");
      room = { code: code, side: side, ref: roomRef(code) };
      done(null);
    });
  }

  function createRoom(teamName, done) {
    if (!connect()) return done("sem-conexao");
    var code = GAME.newRoomCode();
    roomRef(code).child("criadaEm").set(window.firebase.database.ServerValue.TIMESTAMP,
      function (err) {
        if (err) return done(erroDeRede(err));
        claimSide(code, "a", teamName, function (e) { done(e, code); });
      });
  }

  function joinRoom(rawCode, teamName, done) {
    if (!connect()) return done("sem-conexao");
    var code = GAME.normalizeRoomCode(rawCode);
    if (!code) return done("codigo-invalido");

    roomRef(code).child("criadaEm").once("value", function (snap) {
      if (!snap.exists()) return done("sala-inexistente");
      claimSide(code, "b", teamName, function (e) { done(e, code); });
    }, function (err) { done(erroDeRede(err)); });
  }

  /* A regra do banco só aceita placar uma vez. Reenviar o mesmo número é
     inofensivo (a validação compara com o que já está lá), o que deixa o
     retry seguro se a rede oscilar bem na hora de publicar. */
  function publishScore(score) {
    if (!room || !db) return;
    room.ref.child("equipes/" + room.side).update({
      placar: score,
      terminouEm: window.firebase.database.ServerValue.TIMESTAMP
    });
  }

  function reportPhase(phaseIndex) {
    if (!room || !db) return;
    room.ref.child("equipes/" + room.side).child("fase").set(phaseIndex);
  }

  function watchRoom(onChange) {
    if (!room || !db) return;
    stopWatching();
    watcher = function (snap) { onChange(snap.val() || {}); };
    room.ref.child("equipes").on("value", watcher);
  }

  function stopWatching() {
    if (watcher && room) room.ref.child("equipes").off("value", watcher);
    watcher = null;
  }

  function erroDeRede(err) {
    var msg = String((err && err.message) || err || "");
    if (/permission|denied/i.test(msg)) return "sem-permissao";
    return "sem-conexao";
  }

  var MENSAGENS = {
    "sem-conexao":     "Não foi possível falar com o servidor. Confira a internet e tente de novo.",
    "sem-permissao":   "O banco recusou a escrita. As regras do Firebase precisam ser publicadas.",
    "codigo-invalido": "Código inválido. São 4 caracteres, sem as letras B, I, O, S e sem 0, 1, 2, 5 e 8.",
    "sala-inexistente":"Não existe sala com esse código. Confira com a outra equipe.",
    "vaga-ocupada":    "Esta sala já tem duas equipes."
  };

  function textoDoErro(code) {
    return MENSAGENS[code] || MENSAGENS["sem-conexao"];
  }

  /* -----------------------------------------------------------------------
     TELA
     --------------------------------------------------------------------- */

  function mostrarErro(msg) {
    var box = $("#erro-online");
    box.textContent = msg;
    box.classList.remove("oculto");
  }

  function limparErro() { $("#erro-online").classList.add("oculto"); }

  function travando(ligado) {
    ["#btn-criar-sala", "#btn-entrar-sala"].forEach(function (sel) {
      $(sel).disabled = ligado;
    });
  }

  function nomeDaEquipe() {
    var v = $("#nome-equipe-online").value.trim().replace(/\s+/g, " ");
    return v.slice(0, 42);
  }

  function abrirSala(code) {
    limparErro();
    $("#sala-codigo").textContent = code;
    $("#sala-empresa").textContent = GAME.companyForRoom(code);
    $("#painel-sala").classList.remove("oculto");
    $("#painel-entrada").classList.add("oculto");
    acompanharAdversario();
  }

  function acompanharAdversario() {
    watchRoom(function (equipes) {
      var outro = equipes[room.side === "a" ? "b" : "a"];
      var aviso = $("#sala-status");
      if (!outro) {
        aviso.textContent = "Aguardando a outra equipe entrar com este código…";
        $("#btn-comecar-online").disabled = true;
      } else {
        aviso.textContent = "Equipe adversária: " + outro.nome + ". Podem começar.";
        $("#btn-comecar-online").disabled = false;
      }
    });
  }

  function comecar() {
    /* A empresa vem do código, não de um sorteio local: as duas telas
       chegam ao mesmo nome sem trocar uma mensagem sequer. */
    GAME.prepareTeamSetup(GAME.companyForRoom(room.code), true);
  }

  /* -----------------------------------------------------------------------
     PLACAR FINAL — o duelo
     --------------------------------------------------------------------- */

  var meuPlacar = null; /* o nosso placar nós já sabemos: não esperamos a volta */

  function renderDuelo(equipes) {
    var meu = equipes[room.side] || {};
    /* o snapshot pode chegar antes de a nossa própria escrita voltar do
       servidor; usar o número local evita um "—" piscando na tela */
    if (typeof meu.placar !== "number" && typeof meuPlacar === "number") {
      meu = { nome: meu.nome, placar: meuPlacar };
    }
    var outro = equipes[room.side === "a" ? "b" : "a"];
    var bloco = $("#bloco-duelo");
    bloco.classList.remove("oculto");

    if (!outro || typeof outro.placar !== "number") {
      $("#duelo-veredito").textContent = "Aguardando o parecer da outra equipe…";
      $("#duelo-placar").innerHTML =
        linhaDuelo("Sua equipe", meu.nome, meu.placar, "") +
        linhaDuelo("Equipe adversária", (outro && outro.nome) || "—",
                   null, "");
      return;
    }

    var meuP = meu.placar, outroP = outro.placar;
    var veredito = meuP > outroP ? "Sua equipe venceu."
      : meuP < outroP ? "A outra equipe venceu."
      : "Empate — as duas equipes fecharam o processo com a mesma nota.";

    $("#duelo-veredito").textContent = veredito;
    $("#duelo-placar").innerHTML =
      linhaDuelo("Sua equipe", meu.nome, meuP, meuP >= outroP ? "mais" : "menos") +
      linhaDuelo("Equipe adversária", outro.nome, outroP, outroP >= meuP ? "mais" : "menos");
  }

  function linhaDuelo(papel, nome, placar, classe) {
    return "<li><span class='cod'>" + papel + "</span>" +
      "<span>" + escapar(nome || "—") + "</span>" +
      "<span class='pontilhado'></span>" +
      "<span class='val " + classe + "'>" +
      (typeof placar === "number" ? placar : "—") + "</span></li>";
  }

  function escapar(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* -----------------------------------------------------------------------
     LIGAÇÕES COM O JOGO
     --------------------------------------------------------------------- */

  GAME.onFinalScore = function (score) {
    if (!room) return;
    meuPlacar = score;
    publishScore(score);
    watchRoom(renderDuelo);
  };

  GAME.onPhase = function (phaseIndex) {
    if (room) reportPhase(phaseIndex);
  };

  GAME.isOnline = function () { return !!room; };

  function ligar() {
    $("#btn-online").addEventListener("click", function () {
      limparErro();
      $("#painel-sala").classList.add("oculto");
      $("#painel-entrada").classList.remove("oculto");
      GAME.showScreen("#tela-online");
    });

    $("#btn-criar-sala").addEventListener("click", function () {
      var nome = nomeDaEquipe();
      if (!nome) return mostrarErro("Escreva o nome da sua equipe.");
      travando(true);
      createRoom(nome, function (err, code) {
        travando(false);
        if (err) return mostrarErro(textoDoErro(err));
        abrirSala(code);
      });
    });

    $("#btn-entrar-sala").addEventListener("click", function () {
      var nome = nomeDaEquipe();
      if (!nome) return mostrarErro("Escreva o nome da sua equipe.");
      travando(true);
      joinRoom($("#codigo-sala").value, nome, function (err, code) {
        travando(false);
        if (err) return mostrarErro(textoDoErro(err));
        abrirSala(code);
      });
    });

    $("#btn-comecar-online").addEventListener("click", comecar);

    /* dois caminhos de saída: o "Voltar" da entrada e o "Sair da sala" de
       dentro dela. Sair precisa largar o listener, senão a tela seguinte
       continua recebendo atualização de uma sala que não é mais a nossa. */
    ["#btn-voltar-online", "#btn-voltar-online-2"].forEach(function (sel) {
      $(sel).addEventListener("click", function () {
        stopWatching();
        room = null;
        GAME.showScreen("#tela-boas-vindas");
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ligar);
  } else {
    ligar();
  }
})();
