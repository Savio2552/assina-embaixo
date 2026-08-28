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

/* A régua vem do game.js: se alguém mudar o mínimo, o teste acompanha em vez
   de passar a testar um número que o jogo não usa mais. */
var GAME_SRC = fs.readFileSync("assets/js/game.js", "utf8");
var LICENSE_MIN = Number(/var LICENSE_MIN = (\d+);/.exec(GAME_SRC)[1]);

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
    LICENSE_MIN: LICENSE_MIN,
    gradeFor: function (score) { return { granted: score >= LICENSE_MIN }; },
    setTimer: function (on) { GAME._timer = !!on; },
    startSetupTimer: function () { GAME._setupTimer = true; },
    beginGame: function (c, t) { GAME._comecou = { company: c, teams: t }; },
    showScreen: function (s) { telas.push(s); },
    TEAM_SLOTS: 4, onPhase: null, onFinalScore: null
  };

  var win = {
    AssinaEmbaixo: GAME,
    FIREBASE_CONFIG: { databaseURL: "x" },
    firebase: fb.api
  };
  win.firebase.database.ServerValue = { TIMESTAMP: fb.TS };

  var relogios = [];
  var ctx = {
    window: win, document: { readyState: "complete", querySelector: dom.el },
    console: console,
    setInterval: function (fn) { relogios.push(fn); return relogios.length; },
    clearInterval: function (id) { relogios[id - 1] = null; }
  };
  ctx.avancar = function (n) {
    for (var i = 0; i < n; i++) {
      relogios.slice().forEach(function (fn) { if (fn) fn(); });
    }
  };
  ctx.window.document = ctx.document;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync("assets/js/online.js", "utf8"), ctx, { filename: "online.js" });
  return { dom: dom, fb: fb, GAME: GAME, telas: telas, avancar: ctx.avancar };
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

/* ---------- a régua do duelo é a mesma do parecer ---------- */
var bandas = /var GRADE_BANDS = \[([\s\S]*?)\n  \];/.exec(GAME_SRC)[1];
var minimos = (bandas.match(/min: (\d+)/g) || []).map(function (m) { return Number(m.slice(5)); });
ok(minimos.indexOf(LICENSE_MIN) >= 0,
   "não há faixa de parecer começando em " + LICENSE_MIN + ": o selo do duelo diria 'deferido' " +
   "numa nota que o parecer classifica de outro jeito");
secao("régua alinhada com o parecer");

/* ---------- vencer não é deferir ---------- */
function duelo(meu, outro) {
  var t = bootar();
  t.dom.el("#nome-equipe-online").value = "Nós";
  t.dom.el("#btn-criar-sala").click();
  t.fb.write("salas/KQ7D/equipes/b", { nome: "Eles", fase: 4 });
  t.GAME.onFinalScore(meu);
  t.fb.write("salas/KQ7D/equipes/b/placar", outro);
  return t.dom;
}

var alto = LICENSE_MIN + 10, baixo = LICENSE_MIN - 10, maisBaixo = LICENSE_MIN - 20;

/* venceu, mas os dois ficaram abaixo do mínimo — o caso que motivou tudo */
var d1 = duelo(baixo, maisBaixo);
ok(/venceu/.test(d1.el("#duelo-veredito-tela").textContent), "não reconheceu a vitória");
ok(d1.el("#duelo-nos-status").textContent === "Licença não concedida",
   "selo errado abaixo do mínimo: " + d1.el("#duelo-nos-status").textContent);
ok(d1.el("#duelo-nos-status").classList.contains("duelo__status--indeferido"), "selo sem a cor de indeferido");
ok(!d1.el("#duelo-licenca").classList.contains("oculto"), "não mostrou o recado da licença");
ok(d1.el("#duelo-licenca").classList.contains("duelo__licenca--grave"), "recado não veio destacado");
ok(/mesmo assim não deferiu/.test(d1.el("#duelo-licenca").textContent),
   "não disse que venceu sem deferir: " + d1.el("#duelo-licenca").textContent);
secao("venceu mas não deferiu");

/* os dois deferiram */
var d2 = duelo(alto, LICENSE_MIN);
ok(d2.el("#duelo-nos-status").textContent === "Licença concedida", "selo errado acima do mínimo");
ok(d2.el("#duelo-eles-status").textContent === "Licença concedida", "o mínimo exato tem que deferir");
ok(d2.el("#duelo-nos-status").classList.contains("duelo__status--deferido"), "selo sem a cor de deferido");
ok(!d2.el("#duelo-licenca").classList.contains("duelo__licenca--grave"), "destacou sem motivo");
ok(/Os dois processos foram deferidos/.test(d2.el("#duelo-licenca").textContent),
   "recado errado com os dois deferidos: " + d2.el("#duelo-licenca").textContent);
secao("os dois deferiram");

/* perdeu E ficou sem licença */
var d3 = duelo(baixo, alto);
ok(d3.el("#duelo-nos-status").textContent === "Licença não concedida", "selo errado ao perder");
ok(d3.el("#duelo-eles-status").textContent === "Licença concedida", "selo errado do adversário");
ok(d3.el("#duelo-licenca").classList.contains("duelo__licenca--grave"), "perder sem licença deveria destacar");
secao("perdeu e não deferiu");

/* a fronteira exata: um ponto abaixo do mínimo não defere */
var d4 = duelo(LICENSE_MIN - 1, maisBaixo);
ok(d4.el("#duelo-nos-status").textContent === "Licença não concedida",
   "um ponto abaixo do mínimo não pode deferir");
secao("fronteira do mínimo");

/* enquanto o adversário não termina, não há recado de licença a dar */
var t5 = bootar();
t5.dom.el("#nome-equipe-online").value = "Nós";
t5.dom.el("#btn-criar-sala").click();
t5.fb.write("salas/KQ7D/equipes/b", { nome: "Eles", fase: 2 });
t5.GAME.onFinalScore(alto);
ok(t5.dom.el("#duelo-licenca").classList.contains("oculto"), "deu veredito de licença sem os dois placares");
ok(t5.dom.el("#duelo-eles-status").textContent === "—", "inventou selo para quem não terminou");
secao("sem recado antes da hora");

/* ---------- largada conjunta ---------- */
function naSala() {
  var t = bootar();
  t.dom.el("#nome-equipe-online").value = "Nós";
  t.dom.el("#btn-criar-sala").click();
  return t;
}

/* entrar na sala liga o relógio; sair desliga */
var r0 = naSala();
ok(r0.GAME._timer === true, "entrar na sala não ligou o cronômetro");
r0.dom.el("#btn-voltar-online").click();
ok(r0.GAME._timer === false, "sair da sala não desligou o cronômetro");
secao("cronômetro segue a sala");

/* o cadastro abre com prazo */
var r1 = naSala();
r1.fb.write("salas/KQ7D/equipes/b", { nome: "Eles", fase: 0 });
r1.dom.el("#btn-comecar-online").click();
ok(r1.GAME._setupTimer === true, "cadastro abriu sem prazo");
secao("prazo do cadastro");

/* pronta a nossa, o jogo NÃO começa: espera a outra */
var r2 = naSala();
r2.fb.write("salas/KQ7D/equipes/b", { nome: "Eles", fase: 0 });
var assumiu = r2.GAME.onTeamReady("Amanari", [{ name: "P1" }]);
ok(assumiu === true, "online devia assumir a largada e devolver true");
ok(r2.fb.read("salas/KQ7D/equipes/a/pronto") === true, "não se declarou pronta na sala");
ok(r2.telas[r2.telas.length - 1] === "#tela-largada", "não abriu a tela de largada");
ok(!r2.GAME._comecou, "começou o jogo sozinha, sem esperar a outra equipe");
ok(/Aguardando a outra equipe/.test(r2.dom.el("#largada-status").textContent),
   "não avisou que está esperando: " + r2.dom.el("#largada-status").textContent);
ok(/cadastrando/.test(r2.dom.el("#largada-eles").textContent),
   "não mostrou o estado do adversário: " + r2.dom.el("#largada-eles").textContent);
secao("espera a outra equipe");

/* a outra fica pronta: conta 3, 2, 1 e as duas começam */
r2.fb.write("salas/KQ7D/equipes/b/pronto", true);
ok(/prontas/.test(r2.dom.el("#largada-status").textContent), "não anunciou as duas prontas");
ok(!r2.dom.el("#largada-conta").classList.contains("oculto"), "contagem não apareceu");
ok(r2.dom.el("#largada-conta").textContent === 3, "contagem não começou em 3");
ok(!r2.GAME._comecou, "começou antes de a contagem terminar");
r2.avancar(1);
ok(r2.dom.el("#largada-conta").textContent === 2, "contagem não desceu para 2");
r2.avancar(1);
ok(!r2.GAME._comecou, "começou em 1, antes da hora");
r2.avancar(1);
ok(!!r2.GAME._comecou, "não começou o jogo ao fim da contagem");
ok(r2.GAME._comecou.company === "Amanari", "empresa perdida entre o cadastro e a largada");
ok(r2.GAME._comecou.teams.length === 1, "responsáveis perdidos entre o cadastro e a largada");
secao("largada conjunta");

/* fora de sala, o jogo começa sozinho (modo local não pode travar) */
var r3 = bootar();
ok(r3.GAME.onTeamReady("X", []) === false,
   "sem sala, onTeamReady tem que devolver false para o jogo começar sozinho");
secao("modo local não trava");

/* ---------- estouro de prazo pesa como erro ---------- */
var fonte = /function worstPointsFor\(decision\) \{[\s\S]*?\n  \}/.exec(GAME_SRC)[0];
var MULTI_SELECT_FAIL_POINTS = Number(/var MULTI_SELECT_FAIL_POINTS = (-?\d+);/.exec(GAME_SRC)[1]);
var worstPointsFor = new Function("MULTI_SELECT_FAIL_POINTS",
  fonte + "; return worstPointsFor;")(MULTI_SELECT_FAIL_POINTS);

ok(worstPointsFor({ type: "choice", options: [{ points: 10 }, { points: -10 }, { points: -4 }] }) === -10,
   "escolha: pior caso devia ser a opção mais cara");
ok(worstPointsFor({ type: "multiSelect" }) === MULTI_SELECT_FAIL_POINTS,
   "múltipla escolha: pior caso devia ser MULTI_SELECT_FAIL_POINTS");
ok(worstPointsFor({ type: "sorting", cards: [1, 2, 3], pointsPerMiss: -4 }) === -12,
   "ordenação: pior caso devia ser todos os cartões errados");

/* não responder não pode ser melhor do que responder errado */
ok(worstPointsFor({ type: "choice", options: [{ points: 10 }, { points: -10 }] }) < 0,
   "estouro de prazo com pontuação não-negativa: deixar o relógio correr viraria estratégia");

/* a escala da nota e o estouro têm que usar a MESMA conta */
ok(/return s \+ worstPointsFor\(decision\);/.test(GAME_SRC),
   "MIN_POINTS parou de usar worstPointsFor: as duas contas vão divergir");
ok(/points: worstPointsFor\(decision\)/.test(GAME_SRC),
   "evaluateTimeout parou de usar worstPointsFor");
secao("estouro pesa como erro");

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\ntodos os testes passaram");
process.exit(falhas ? 1 : 0);
