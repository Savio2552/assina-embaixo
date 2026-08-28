/* =========================================================================
   FIREBASE — configuração do projeto

   Estas chaves são públicas por natureza: elas viajam para o navegador de
   todo mundo que abre o jogo. Não são segredo e não protegem nada. Quem
   protege o banco são as regras em firebase/database.rules.json.

   Só o index.html carrega este arquivo. O assina-embaixo.html continua
   sem rede, para funcionar no pendrive quando a internet da sala cair.
   ========================================================================= */

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyAs-1HeRdYF948bohc6urtVzsR6YtQwA3c",
  authDomain: "assina-embaixo.firebaseapp.com",
  databaseURL: "https://assina-embaixo-default-rtdb.firebaseio.com",
  projectId: "assina-embaixo",
  storageBucket: "assina-embaixo.firebasestorage.app",
  messagingSenderId: "137974245679",
  appId: "1:137974245679:web:4f19a2f2bf351d6c9a99da"
};
