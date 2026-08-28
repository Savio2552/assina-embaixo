/* =========================================================================
   TESTES DO MODO ONLINE

   Roda o assets/js/online.js de verdade contra um DOM mínimo e um Realtime
   Database em memória (tests/harness.js). Sem navegador, sem rede e sem
   tocar no Firebase de verdade.

       node tests/online.test.js

   O caso "terminar em segundo" existe porque um bug real passou por aqui: a
   tela ficava presa em "aguardando" quando o adversário terminava primeiro.
   ========================================================================= */

var fs = require("fs"), vm = require("vm"), path = require("path");
var H = require(path.join(__dirname, "harness.js"));

var falhas = 0;
function ok(c, m) { if (!c) { falhas++; console.log("  FALHOU: " + m); } }

var marca = 0;
function secao(nome) {
  console.log(nome + ": " + (falhas === marca ? "ok" : "FALHOU"));
  marca = falhas;
}

function bootar() {
  var dom = H.makeDom();
  var fb = H.makeFirebase();
  var telas = [];

  var GAME = {
    newRoomCode: function () { return "KQ7D"; },
    normalizeRoomCode: function (r) { return String(r).toUpperCase() === "KQ7D" ? "KQ7D" : ""; },
    companyForRoom: function () { return "Igarapé Verde Alimentos"; },
    prepareTeamSetup: function (c) { GAME._empresa = c; },
    showScreen: function (s) { telas.push(s); },
    TEAM_SLOTS: 4, onPhase: null, onFinalScore: null
  };

  var win = {
    AssinaEmbaixo: GAME,
    FIREBASE_CONFIG: { databaseURL: "x" },
    firebase: fb.api
  };
  win.firebase.database.ServerValue = { TIMESTAMP: fb.TS };

  var ctx = {
    window: win, document: { readyState: "complete", querySelector: dom.el },
    console: console
  };
  ctx.window.document = ctx.document;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync("assets/js/online.js", "utf8"), ctx, { filename: "online.js" });
  return { dom: dom, fb: fb, GAME: GAME, telas: telas };
}

/* ---------- 1. criar sala ---------- */
var s = bootar();
s.dom.el("#nome-equipe-online").value = "Equipe da manhã";
s.dom.el("#btn-criar-sala").click();
ok(s.dom.el("#sala-codigo").textContent === "KQ7D", "código não apareceu na tela");
ok(s.dom.el("#sala-empresa").textContent === "Igarapé Verde Alimentos", "empresa não apareceu");
ok(s.fb.read("salas/KQ7D/equipes/a/nome") === "Equipe da manhã", "vaga 'a' não foi tomada");
ok(s.dom.el("#btn-comecar-online").disabled === true, "deixou começar sem a outra equipe");
secao("criar sala");

/* ---------- 2. adversário entra ---------- */
s.fb.write("salas/KQ7D/equipes/b", { nome: "Equipe da tarde", fase: 0 });
ok(s.dom.el("#btn-comecar-online").disabled === false, "não liberou o começo com as duas equipes");
ok(/Equipe da tarde/.test(s.dom.el("#sala-status").textContent), "não anunciou o adversário");
secao("adversário entra");

/* ---------- 3. a empresa vem do código, não de sorteio local ---------- */
s.dom.el("#btn-comecar-online").click();
ok(s.GAME._empresa === "Igarapé Verde Alimentos", "empresa não foi travada no cadastro");
secao("empresa compartilhada");

/* ---------- 4. terminamos primeiro: espera o adversário ---------- */
s.GAME.onFinalScore(72);
ok(s.telas[s.telas.length - 1] === "#tela-duelo", "não abriu a tela do duelo ao terminar");
ok(s.dom.el("#duelo-nos-placar").textContent === 72, "nosso placar não apareceu na hora");
ok(s.dom.el("#duelo-eles-placar").textContent === "—", "mostrou placar que ainda não existe");
ok(s.dom.el("#duelo-eles").classList.contains("duelo__lado--esperando"), "lado do adversário não ficou pontilhado");
ok(/Aguardando/.test(s.dom.el("#duelo-veredito-tela").textContent), "não avisou que está esperando");
ok(s.fb.read("salas/KQ7D/equipes/a/placar") === 72, "placar não foi publicado");
secao("espera pelo adversário");

/* ---------- 5. adversário termina com menos: vencemos, sem recarregar ---------- */
s.fb.write("salas/KQ7D/equipes/b/placar", 65);
ok(s.dom.el("#duelo-eles-placar").textContent === 65, "tela não se atualizou sozinha");
ok(s.dom.el("#duelo-nos").classList.contains("duelo__lado--vence"), "vencedor não foi marcado");
ok(s.dom.el("#duelo-eles").classList.contains("duelo__lado--perde"), "perdedor não foi marcado");
ok(!s.dom.el("#duelo-eles").classList.contains("duelo__lado--esperando"), "sobrou o estado de espera");
ok(s.dom.el("#duelo-veredito-tela").textContent === "Sua equipe venceu por 7 pontos.", "veredito errado: " + s.dom.el("#duelo-veredito-tela").textContent);
secao("vitória");

/* ---------- 6. derrota e empate ---------- */
function veredito(meu, outro) {
  var t = bootar();
  t.dom.el("#nome-equipe-online").value = "Nós";
  t.dom.el("#btn-criar-sala").click();
  t.fb.write("salas/KQ7D/equipes/b", { nome: "Eles", fase: 0 });
  t.GAME.onFinalScore(meu);
  t.fb.write("salas/KQ7D/equipes/b/placar", outro);
  return { txt: t.dom.el("#duelo-veredito-tela").textContent, dom: t.dom };
}
var d = veredito(40, 90);
ok(d.txt === "A equipe adversária venceu por 50 pontos.", "derrota: " + d.txt);
ok(d.dom.el("#duelo-eles").classList.contains("duelo__lado--vence"), "derrota não marcou o vencedor certo");
var e = veredito(80, 80);
ok(e.txt === "Empate: as duas fecharam o processo com 80 pontos.", "empate: " + e.txt);
ok(e.dom.el("#duelo-nos").classList.contains("duelo__lado--vence") &&
   e.dom.el("#duelo-eles").classList.contains("duelo__lado--vence"), "empate não marcou os dois");
var um = veredito(51, 50);
ok(um.txt === "Sua equipe venceu por 1 ponto.", "singular: " + um.txt);
secao("derrota, empate e singular");

/* ---------- 7. sala cheia e código inválido ---------- */
var t = bootar();
t.fb.write("salas/KQ7D", { criadaEm: 1, equipes: { a: { nome: "A" }, b: { nome: "B" } } });
t.dom.el("#nome-equipe-online").value = "Terceira";
t.dom.el("#codigo-sala").value = "KQ7D";
t.dom.el("#btn-entrar-sala").click();
ok(/já tem duas equipes/.test(t.dom.el("#erro-online").textContent), "sala cheia: " + t.dom.el("#erro-online").textContent);
ok(t.dom.el("#btn-entrar-sala").disabled === false, "botão ficou travado após o erro");

var u = bootar();
u.dom.el("#nome-equipe-online").value = "X";
u.dom.el("#codigo-sala").value = "ZZZZ";
u.dom.el("#btn-entrar-sala").click();
ok(/Código inválido/.test(u.dom.el("#erro-online").textContent), "código inválido: " + u.dom.el("#erro-online").textContent);

var v = bootar();
v.dom.el("#nome-equipe-online").value = "";
v.dom.el("#btn-criar-sala").click();
ok(/nome da sua equipe/.test(v.dom.el("#erro-online").textContent), "aceitou equipe sem nome");
secao("erros tratados");

/* ---------- 8. o nome do adversário não pode injetar HTML ---------- */
var x = bootar();
x.dom.el("#nome-equipe-online").value = "Nós";
x.dom.el("#btn-criar-sala").click();
x.fb.write("salas/KQ7D/equipes/b", { nome: '<img src=x onerror=alert(1)>', fase: 0 });
x.GAME.onFinalScore(10);
x.fb.write("salas/KQ7D/equipes/b/placar", 20);
ok(x.dom.el("#duelo-placar").innerHTML.indexOf("<img") < 0, "HTML do adversário entrou cru no parecer");
ok(x.dom.el("#duelo-placar").innerHTML.indexOf("&lt;img") >= 0, "nome não foi escapado");
secao("nome hostil escapado");

/* NOSSA EQUIPE TERMINA EM SEGUNDO: o adversário já tem placar quando
   chegamos ao fim, e nenhum snapshot novo vai chegar depois. */
var s2 = bootar();
s2.dom.el("#nome-equipe-online").value = "Nós";
s2.dom.el("#btn-criar-sala").click();
s2.fb.write("salas/KQ7D/equipes/b", { nome: "Eles", fase: 4 });
s2.fb.write("salas/KQ7D/equipes/b/placar", 88);   /* eles terminam primeiro */

s2.GAME.onFinalScore(91);                          /* só agora terminamos nós */

var eles = s2.dom.el("#duelo-eles-placar").textContent;
var txt = s2.dom.el("#duelo-veredito-tela").textContent;
ok(eles === 88, "placar do adversário sumiu da tela (mostrou: " + eles + ")");
ok(txt === "Sua equipe venceu por 3 pontos.", "veredito ficou preso na espera: " + txt);
ok(!s2.dom.el("#duelo-eles").classList.contains("duelo__lado--esperando"),
   "lado do adversário ficou pontilhado mesmo com ele já tendo terminado");

secao("terminar em segundo");

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\ntodos os testes passaram");
process.exit(falhas ? 1 : 0);
