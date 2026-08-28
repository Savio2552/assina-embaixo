/* Ambiente falso: DOM mínimo + Realtime Database em memória.
   Serve para rodar o online.js de verdade, sem navegador e sem rede. */

function makeDom() {
  var els = {};
  function el(sel) {
    if (els[sel]) return els[sel];
    var classes = {};
    var e = {
      _sel: sel, textContent: "", innerHTML: "", value: "", disabled: false,
      handlers: {},
      classList: {
        add: function (c) { classes[c] = true; },
        remove: function (c) { delete classes[c]; },
        contains: function (c) { return !!classes[c]; },
        toggle: function (c, on) { if (on === undefined) on = !classes[c]; if (on) classes[c] = true; else delete classes[c]; },
        _all: function () { return Object.keys(classes).sort(); }
      },
      addEventListener: function (ev, fn) { (e.handlers[ev] = e.handlers[ev] || []).push(fn); },
      click: function () { (e.handlers.click || []).forEach(function (f) { f(); }); }
    };
    els[sel] = e;
    return e;
  }
  return { el: el, all: els };
}

function makeFirebase() {
  var store = {};
  var listeners = [];
  var TS = "__TIMESTAMP__";

  function split(p) { return p.split("/").filter(Boolean); }
  function read(path) {
    var cur = store;
    var parts = split(path);
    for (var i = 0; i < parts.length; i++) {
      if (cur === null || typeof cur !== "object") return null;
      cur = cur[parts[i]];
      if (cur === undefined) return null;
    }
    return cur === undefined ? null : cur;
  }
  function resolve(v) {
    if (v === TS) return Date.now();
    if (v && typeof v === "object") {
      var o = Array.isArray(v) ? [] : {};
      Object.keys(v).forEach(function (k) { o[k] = resolve(v[k]); });
      return o;
    }
    return v;
  }
  function write(path, val) {
    var parts = split(path), cur = store;
    for (var i = 0; i < parts.length - 1; i++) {
      if (typeof cur[parts[i]] !== "object" || cur[parts[i]] === null) cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    if (val === null) delete cur[parts[parts.length - 1]];
    else cur[parts[parts.length - 1]] = resolve(val);
    fire();
  }
  function fire() {
    listeners.slice().forEach(function (l) { l.cb({ val: function () { return read(l.path); } }); });
  }

  function ref(path) {
    return {
      _path: path,
      child: function (p) { return ref(path + "/" + p); },
      set: function (v, cb) { write(path, v); if (cb) cb(null); },
      update: function (obj) { Object.keys(obj).forEach(function (k) { write(path + "/" + k, obj[k]); }); },
      once: function (_e, cb, errCb) {
        var v = read(path);
        cb({ exists: function () { return v !== null; }, val: function () { return v; } });
      },
      on: function (_e, cb) { listeners.push({ path: path, cb: cb }); cb({ val: function () { return read(path); } }); },
      off: function (_e, cb) { listeners = listeners.filter(function (l) { return l.cb !== cb; }); },
      transaction: function (fn, cb) {
        var atual = read(path);
        var novo = fn(atual);
        if (novo === undefined) return cb(null, false);
        write(path, novo);
        cb(null, true);
      }
    };
  }

  return {
    api: { apps: [], initializeApp: function () { this.apps.push(1); },
           database: function () { var d = function () {}; d.ref = ref; return { ref: ref }; } },
    dump: function () { return JSON.parse(JSON.stringify(store)); },
    write: write, read: read, TS: TS
  };
}
makeFirebase.TS = "__TIMESTAMP__";
module.exports = { makeDom: makeDom, makeFirebase: makeFirebase };
