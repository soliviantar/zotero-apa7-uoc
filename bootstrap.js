/* bootstrap.js — Plugin APA 7.ª edición – Adaptación UOC  v6 
 *
 * Inyecta [NombreCompleto] tras las iniciales en bibliografías APA UOC.
 *
 * Esta versión añade un SEGUNDO punto de intercepción respecto a la v5:
 *
 *   Patch 1 (original): Zotero.Cite.makeFormattedBibliography
 *     → usado por "Crear bibliografía a partir del elemento" y Quick Copy.
 *
 *   Patch 2 (nuevo):     Zotero.Style.prototype.getCiteProc
 *     → es la función que crea/entrega la instancia del motor citeproc-js
 *       para un estilo. TODOS los consumidores de una bibliografía —incluida
 *       la integración con Word/LibreOffice— obtienen su motor CSL pasando
 *       por aquí. En cuanto se crea una instancia del motor para el estilo
 *       UOC, le envolvemos su propio método makeBibliography(). Así, sea
 *       quien sea quien pida la bibliografía después (Word incluido), la
 *       inyección de [Nombre] se aplica igual.
 */

var APA7UOC = {
  STYLE_ID: "http://www.zotero.org/styles/apa-uoc-7th",
  _rootURI: null,
  _patched: false,
  _originalMakeFormatted: null,
  _originalGetCiteProc: null,

  init: function (rootURI) {
    this._rootURI = rootURI;
    Zotero.APA7UOC = this;
    Zotero.debug("APA7-UOC: init() OK, rootURI=" + rootURI);
  },

  applyPatches: function () {
    if (this._patched) {
      Zotero.debug("APA7-UOC: Patches ya aplicados, saltando");
      return;
    }
    this._patched = true;
    var self = this;

    Zotero.debug("APA7-UOC: === Aplicando patches ===");

    // --- Patch 1: Zotero.Cite.makeFormattedBibliography ---
    // Esta función genera el HTML/texto de la bibliografía.
    // Es llamada por "Crear bibliografía a partir del elemento" y Quick Copy.
    try {
      if (Zotero.Cite && typeof Zotero.Cite.makeFormattedBibliography === "function") {
        this._originalMakeFormatted = Zotero.Cite.makeFormattedBibliography;
        var origFn = this._originalMakeFormatted;

        Zotero.Cite.makeFormattedBibliography = function (cslEngine, format) {
          var result;
          try {
            result = origFn.apply(this, arguments);
          } catch (e) {
            Zotero.debug("APA7-UOC: Error llamando original: " + e);
            throw e;
          }

          // Solo procesar strings (HTML o texto plano)
          if (typeof result !== "string") {
            Zotero.debug("APA7-UOC: [makeFormattedBibliography] Resultado no es string, tipo=" + typeof result);
            return result;
          }

          var isUOC = self._isUOCStyle(cslEngine);
          Zotero.debug("APA7-UOC: [makeFormattedBibliography] isUOC=" + isUOC);

          if (!isUOC) return result;

          var items = self._getRegisteredItems(cslEngine);
          Zotero.debug("APA7-UOC: [makeFormattedBibliography] Procesando " + items.length + " items");

          if (items.length === 0) return result;

          return self._injectFullNames(result, items);
        };

        Zotero.debug("APA7-UOC: ✓ Patch makeFormattedBibliography OK");
      } else {
        Zotero.debug("APA7-UOC: ✗ Cite.makeFormattedBibliography NO disponible");
      }
    } catch (e) {
      Zotero.debug("APA7-UOC: ERROR Patch 1: " + e);
      if (e.stack) Zotero.debug("APA7-UOC: Stack: " + e.stack);
    }

    // --- Patch 2: Zotero.Style.prototype.getCiteProc ---
    // Punto de creación del motor citeproc-js para un estilo. Lo usan tanto
    // "Crear bibliografía" como la integración con Word/LibreOffice.
    try {
      if (Zotero.Style && Zotero.Style.prototype && typeof Zotero.Style.prototype.getCiteProc === "function") {
        this._originalGetCiteProc = Zotero.Style.prototype.getCiteProc;
        var origGetCiteProc = this._originalGetCiteProc;

        Zotero.Style.prototype.getCiteProc = function () {
          var engine = origGetCiteProc.apply(this, arguments);
          try {
            self._wrapEngineMakeBibliography(engine);
          } catch (e) {
            Zotero.debug("APA7-UOC: Error envolviendo engine tras getCiteProc: " + e);
          }
          return engine;
        };

        Zotero.debug("APA7-UOC: ✓ Patch Style.prototype.getCiteProc OK");
      } else {
        Zotero.debug("APA7-UOC: ✗ Style.prototype.getCiteProc NO disponible (revisar nombre real de la función en esta versión de Zotero)");
      }
    } catch (e) {
      Zotero.debug("APA7-UOC: ERROR Patch 2: " + e);
      if (e.stack) Zotero.debug("APA7-UOC: Stack: " + e.stack);
    }

    Zotero.debug("APA7-UOC: === Patches completados ===");
  },

  removePatches: function () {
    if (this._originalMakeFormatted) {
      Zotero.Cite.makeFormattedBibliography = this._originalMakeFormatted;
      this._originalMakeFormatted = null;
    }
    if (this._originalGetCiteProc) {
      Zotero.Style.prototype.getCiteProc = this._originalGetCiteProc;
      this._originalGetCiteProc = null;
    }
    this._patched = false;
    Zotero.debug("APA7-UOC: Patches eliminados");
  },

  installCSL: function () {
    try {
      var cslURL = this._rootURI + "csl/apa-uoc-7th.csl";
      Zotero.debug("APA7-UOC: Leyendo CSL desde: " + cslURL);
      var cslContent = null;
      try { cslContent = Zotero.File.getContentsFromURL(cslURL); } catch (e) {}
      if (!cslContent) {
        try { cslContent = Zotero.File.getContentsFromURL(this._rootURI + "csl\\apa-uoc-7th.csl"); } catch (e) {}
      }
      if (cslContent) {
        Zotero.debug("APA7-UOC: CSL leído (" + cslContent.length + " bytes)");
        Zotero.Styles.install({ string: cslContent }, "apa-uoc-7th.csl", true);
        Zotero.debug("APA7-UOC: CSL instalado OK");
      } else {
        Zotero.debug("APA7-UOC: No se pudo leer CSL desde XPI");
        var exists = Zotero.Styles.get(this.STYLE_ID);
        Zotero.debug("APA7-UOC: Estilo ya en Zotero: " + (exists ? "SÍ" : "NO"));
      }
    } catch (e) {
      Zotero.debug("APA7-UOC: Error CSL: " + e);
    }
  },

  // =========================================================================
  // DETECCIÓN DE ESTILO
  // =========================================================================

  _isUOCStyle: function (cslEngine) {
    try {
      if (!cslEngine) return false;
      if (cslEngine.opt && cslEngine.opt.styleID) {
        if (String(cslEngine.opt.styleID).indexOf("apa-uoc") !== -1) return true;
      }
      if (cslEngine.sys && cslEngine.sys.id) {
        if (String(cslEngine.sys.id).indexOf("apa-uoc") !== -1) return true;
      }
      if (cslEngine.opt) {
        var keys = Object.keys(cslEngine.opt);
        for (var i = 0; i < keys.length; i++) {
          var v = cslEngine.opt[keys[i]];
          if (typeof v === "string" && v.indexOf("apa-uoc") !== -1) return true;
        }
      }
    } catch (e) {
      Zotero.debug("APA7-UOC: _isUOCStyle error: " + e);
    }
    return false;
  },

  _getRegisteredItems: function (cslEngine) {
    try {
      if (cslEngine && cslEngine.registry && cslEngine.registry.reflist) {
        return cslEngine.registry.reflist.map(function (ref) {
          try { return Zotero.Items.get(ref.id); } catch (e) { return null; }
        }).filter(function (item) { return item; });
      }
    } catch (e) {
      Zotero.debug("APA7-UOC: _getRegisteredItems error: " + e);
    }
    return [];
  },

  // =========================================================================
  // ENVOLTURA DEL MOTOR CITEPROC (nuevo en v6)
  // =========================================================================

  // Envuelve engine.makeBibliography() para una instancia concreta del motor
  // CSL. Se llama justo después de crear/obtener el motor vía getCiteProc().
  // engine.makeBibliography() devuelve [bibmeta, entries], donde:
  //   - bibmeta.entry_ids es un array (una entrada por referencia) de arrays
  //     (uno o más IDs de item agrupados en esa entrada)
  //   - entries es el array paralelo de strings ya formateados
  _wrapEngineMakeBibliography: function (engine) {
    if (!engine || engine.__apa7uocWrapped) return;
    if (typeof engine.makeBibliography !== "function") {
      Zotero.debug("APA7-UOC: engine.makeBibliography no es función, no se envuelve");
      return;
    }
    var self = this;
    var origMB = engine.makeBibliography;

    engine.makeBibliography = function () {
      var result = origMB.apply(this, arguments);

      try {
        var isUOC = self._isUOCStyle(this);
        Zotero.debug("APA7-UOC: [engine.makeBibliography] isUOC=" + isUOC);
        if (!isUOC) return result;
        if (!result || !Array.isArray(result) || result.length < 2) return result;

        var bibmeta = result[0];
        var entries = result[1];
        var idLists = bibmeta && bibmeta.entry_ids;
        if (!idLists) {
          Zotero.debug("APA7-UOC: [engine.makeBibliography] Sin entry_ids en bibmeta");
          return result;
        }

        for (var i = 0; i < entries.length; i++) {
          try {
            var idList = idLists[i];
            if (!idList || !idList.length) continue;

            var relatedItems = [];
            for (var k = 0; k < idList.length; k++) {
              var it = null;
              try { it = Zotero.Items.get(idList[k]); } catch (e2) {}
              if (it) relatedItems.push(it);
            }
            if (relatedItems.length === 0) continue;

            entries[i] = self._injectFullNames(entries[i], relatedItems);
          } catch (eEntry) {
            Zotero.debug("APA7-UOC: Error procesando entrada " + i + " de makeBibliography: " + eEntry);
          }
        }

        Zotero.debug("APA7-UOC: [engine.makeBibliography] " + entries.length + " entradas procesadas");
        return [bibmeta, entries];
      } catch (eOuter) {
        Zotero.debug("APA7-UOC: Error en engine.makeBibliography envuelto: " + eOuter);
        return result;
      }
    };

    engine.__apa7uocWrapped = true;
    Zotero.debug("APA7-UOC: ✓ Engine.makeBibliography envuelto para esta instancia");
  },

  // =========================================================================
  // INYECCIÓN DE [Nombre]  (sin cambios respecto a v5)
  // =========================================================================

  _injectFullNames: function (bibOutput, items) {
    if (!bibOutput || !items || items.length === 0) return bibOutput;

    var result = bibOutput;

    for (var i = 0; i < items.length; i++) {
      try {
        var item = items[i];
        if (!item || typeof item.getCreators !== "function") continue;

        var creators = item.getCreators();
        if (!creators || creators.length === 0) continue;

        for (var j = 0; j < creators.length; j++) {
          var c = creators[j];
          if (c.fieldMode === 1 || !c.firstName) continue;

          var fn = c.firstName.trim();
          var ln = c.lastName.trim();
          if (!fn || !ln) continue;

          if (this._isOnlyInitials(fn)) continue;

          var initials = this._getInitials(fn);

          var eln = this._esc(ln);
          var ei = this._esc(initials);

          if (new RegExp(eln + ",\\s*" + ei + "\\s*\\[").test(result)) continue;

          var re = new RegExp("(" + eln + ",\\s*" + ei + ")(?!\\s*\\[)(?!\\s[A-Z\\u00C0-\\u024F]\\.)", "g");
          result = result.replace(re, "$1 [" + fn + "]");
        }
      } catch (e) {
        Zotero.debug("APA7-UOC: Error en item " + i + ": " + e);
      }
    }

    result = result.replace(/\](\s+)\((\d{4})/g, "].$1($2");

    return result;
  },

  _getInitials: function (firstName) {
    if (!firstName) return "";
    if (/^[A-Z\u00C0-\u024F]\.(\s*-?\s*[A-Z\u00C0-\u024F]\.)*\s*$/i.test(firstName)) {
      return firstName.trim();
    }
    var parts = firstName.split(/\s+/);
    var inits = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!p) continue;
      if (p.indexOf("-") !== -1) {
        inits.push(p.split("-").filter(Boolean).map(function (s) {
          return s.charAt(0).toUpperCase() + ".";
        }).join("-"));
      } else if (/^[A-Z]\.[A-Z]/i.test(p)) {
        var letters = p.match(/[A-Za-z]/g);
        if (letters && letters.length >= 2) {
          for (var k = 0; k < letters.length; k++) {
            inits.push(letters[k].toUpperCase() + ".");
          }
        } else {
          inits.push(p.charAt(0).toUpperCase() + ".");
        }
      } else {
        inits.push(p.charAt(0).toUpperCase() + ".");
      }
    }
    return inits.join(" ");
  },

  _isOnlyInitials: function (firstName) {
    if (!firstName) return true;
    var parts = firstName.trim().split(/\s+/);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!p) continue;
      var subparts = p.split("-");
      for (var j = 0; j < subparts.length; j++) {
        var sp = subparts[j];
        if (!sp) continue;
        if (!/^[A-Z\u00C0-\u024F]\.?$/i.test(sp)) {
          return false;
        }
      }
    }
    return true;
  },

  _esc: function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
};


// =========================================================================
// BOOTSTRAP LIFECYCLE
// =========================================================================

function install() {}

function startup({ id, version, rootURI }, reason) {
  try {
    Zotero.debug("APA7-UOC: === STARTUP v" + version + " ===");
    APA7UOC.init(rootURI);

    var doInit = function () {
      try {
        Zotero.debug("APA7-UOC: Zotero inicializado, aplicando...");
        APA7UOC.installCSL();
        APA7UOC.applyPatches();
      } catch (e) {
        Zotero.debug("APA7-UOC: ERROR en doInit: " + e);
        if (e.stack) Zotero.debug("APA7-UOC: Stack: " + e.stack);
      }
    };

    if (Zotero.initialized) {
      doInit();
    } else {
      Zotero.initializationPromise.then(doInit);
    }
  } catch (e) {
    Zotero.debug("APA7-UOC: ERROR FATAL en startup: " + e);
  }
}

function onMainWindowLoad({ window }) {
  Zotero.debug("APA7-UOC: === MAIN WINDOW LOAD ===");
  try {
    APA7UOC.applyPatches();
  } catch (e) {
    Zotero.debug("APA7-UOC: ERROR en onMainWindowLoad: " + e);
  }
}

function onMainWindowUnload({ window }) {}

function shutdown({ id, version, rootURI }, reason) {
  if (reason === APP_SHUTDOWN) return;
  try {
    Zotero.debug("APA7-UOC: === SHUTDOWN ===");
    APA7UOC.removePatches();
    delete Zotero.APA7UOC;
  } catch (e) {
    Zotero.debug("APA7-UOC: ERROR shutdown: " + e);
  }
}

function uninstall() {}
